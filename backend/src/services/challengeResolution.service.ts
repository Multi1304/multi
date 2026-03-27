import crypto from 'crypto';
import { prisma } from '../prisma';
import { RuntimeEnvironmentMode, RuntimeEnvironmentService } from './runtimeEnvironment.service';

export interface ChallengeResolutionSettings {
  mode: 'disabled' | 'manual' | 'credit_pool';
  balance: number;
  allowedHosts: string[];
  fallbackAction: 'observe_only' | 'recycle_context' | 'rotate_sticky_proxy';
}

export interface ChallengeResolutionOptions {
  tenantId?: string | null;
  host: string;
  code: number;
  reason: string;
  environment?: RuntimeEnvironmentMode;
}

export interface ChallengeResolutionResult {
  handled: boolean;
  status: 'disabled' | 'manual_required' | 'resolved' | 'depleted' | 'skipped';
  provider: 'sandbox' | 'production';
  remainingBalance: number | null;
  token: string | null;
  fallbackAction: ChallengeResolutionSettings['fallbackAction'];
}

interface ChallengeResolutionAdapter {
  resolve(options: ChallengeResolutionOptions): Promise<ChallengeResolutionResult>;
}

const DEFAULT_SETTINGS: ChallengeResolutionSettings = {
  mode: 'manual',
  balance: 0,
  allowedHosts: ['localhost', '127.0.0.1'],
  fallbackAction: 'rotate_sticky_proxy',
};

class SandboxChallengeResolutionAdapter implements ChallengeResolutionAdapter {
  async resolve(): Promise<ChallengeResolutionResult> {
    return {
      handled: false,
      status: 'manual_required',
      provider: 'sandbox',
      remainingBalance: null,
      token: null,
      fallbackAction: 'observe_only',
    };
  }
}

class ProductionChallengeResolutionAdapter implements ChallengeResolutionAdapter {
  async resolve(options: ChallengeResolutionOptions): Promise<ChallengeResolutionResult> {
    if (!options.tenantId) {
      return {
        handled: false,
        status: 'skipped',
        provider: 'production',
        remainingBalance: null,
        token: null,
        fallbackAction: DEFAULT_SETTINGS.fallbackAction,
      };
    }

    const settings = await getSettings(options.tenantId);
    const host = String(options.host || '').toLowerCase();
    const allowed = settings.allowedHosts.some((entry) => host === entry || host.endsWith(`.${entry}`));
    if (!allowed) {
      return {
        handled: false,
        status: 'skipped',
        provider: 'production',
        remainingBalance: settings.balance,
        token: null,
        fallbackAction: settings.fallbackAction,
      };
    }

    if (settings.mode === 'disabled') {
      return {
        handled: false,
        status: 'disabled',
        provider: 'production',
        remainingBalance: settings.balance,
        token: null,
        fallbackAction: settings.fallbackAction,
      };
    }

    if (settings.mode === 'manual') {
      return {
        handled: false,
        status: 'manual_required',
        provider: 'production',
        remainingBalance: settings.balance,
        token: null,
        fallbackAction: settings.fallbackAction,
      };
    }

    if (settings.balance <= 0) {
      return {
        handled: false,
        status: 'depleted',
        provider: 'production',
        remainingBalance: 0,
        token: null,
        fallbackAction: settings.fallbackAction,
      };
    }

    const nextBalance = settings.balance - 1;
    await storeSettings(options.tenantId, { ...settings, balance: nextBalance });
    return {
      handled: true,
      status: 'resolved',
      provider: 'production',
      remainingBalance: nextBalance,
      token: `internal-${crypto.randomUUID()}`,
      fallbackAction: settings.fallbackAction,
    };
  }
}

const sandboxAdapter = new SandboxChallengeResolutionAdapter();
const productionAdapter = new ProductionChallengeResolutionAdapter();

export class ChallengeResolutionService {
  static async resolve(options: ChallengeResolutionOptions) {
    const environment = await RuntimeEnvironmentService.resolve({
      tenantId: options.tenantId,
      explicitMode: options.environment,
    });
    const adapter = environment === 'sandbox' ? sandboxAdapter : productionAdapter;
    return adapter.resolve(options);
  }
}

async function getSettings(tenantId: string): Promise<ChallengeResolutionSettings> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  }).catch(() => null);
  const raw = (tenant?.settings as any)?.firstPartyChallengeResolution || {};
  return {
    mode: raw.mode === 'disabled' || raw.mode === 'credit_pool' ? raw.mode : DEFAULT_SETTINGS.mode,
    balance: Math.max(0, Number(raw.balance ?? DEFAULT_SETTINGS.balance)),
    allowedHosts: Array.isArray(raw.allowedHosts) && raw.allowedHosts.length
      ? raw.allowedHosts.map((item: any) => String(item).toLowerCase())
      : DEFAULT_SETTINGS.allowedHosts,
    fallbackAction: raw.fallbackAction === 'observe_only' || raw.fallbackAction === 'recycle_context'
      ? raw.fallbackAction
      : DEFAULT_SETTINGS.fallbackAction,
  };
}

async function storeSettings(tenantId: string, settings: ChallengeResolutionSettings) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  });
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      settings: {
        ...((tenant?.settings as any) || {}),
        firstPartyChallengeResolution: settings,
      } as any,
    },
  });
}
