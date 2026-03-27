import crypto from 'crypto';
import type { BrowserContext, Page, Response } from 'playwright';
import { logger } from '../utils/logger';
import { NetworkRoutingService } from './networkRouting.service';
import { RuntimeEnvironmentMode, RuntimeEnvironmentService } from './runtimeEnvironment.service';
import { ChallengeResolutionService } from './challengeResolution.service';

export interface RuntimeMitigationSettings {
  enabled: boolean;
  allowedHosts: string[];
  autoRecycleOnInternalChallenge: boolean;
  rotateStickyProxyOnInternalChallenge: boolean;
  pauseOnExternalChallenge: boolean;
}

const DEFAULT_SETTINGS: RuntimeMitigationSettings = {
  enabled: true,
  allowedHosts: ['localhost', '127.0.0.1'],
  autoRecycleOnInternalChallenge: true,
  rotateStickyProxyOnInternalChallenge: true,
  pauseOnExternalChallenge: true,
};

export interface RuntimeMitigationAttachOptions {
  tenantId?: string | null;
  profileId?: string | null;
  fingerprint?: any;
  proxy?: any;
  environment?: RuntimeEnvironmentMode;
}

export interface RuntimeMitigationState {
  lastSignalAt: string;
  code: number;
  host: string;
  action: 'observe_only' | 'recycle_context' | 'rotate_sticky_proxy' | 'resolve_internal_challenge' | 'manual_review';
  reason: string;
  runtimeSeed: string;
  challengeResolution?: {
    status: string;
    remainingBalance: number | null;
    provider: string;
  } | null;
}

interface RuntimeMitigationAdapter {
  attach(page: Page, context: BrowserContext, options: RuntimeMitigationAttachOptions): void;
}

class SandboxRuntimeMitigationAdapter implements RuntimeMitigationAdapter {
  attach() {
    return;
  }
}

class ProductionRuntimeMitigationAdapter implements RuntimeMitigationAdapter {
  attach(page: Page, _context: BrowserContext, options: RuntimeMitigationAttachOptions) {
    page.on('response', async (response) => {
      try {
        const outcome = classifyChallenge(response);
        if (!outcome) return;

        const url = new URL(response.url());
        const host = url.hostname.toLowerCase();
        const internalHost = isAllowedHost(DEFAULT_SETTINGS.allowedHosts, host);
        const challengeResolution = internalHost
          ? await ChallengeResolutionService.resolve({
              tenantId: options.tenantId,
              host,
              code: outcome.code,
              reason: outcome.reason,
              environment: options.environment,
            }).catch(() => null)
          : null;
        const state: RuntimeMitigationState = {
          lastSignalAt: new Date().toISOString(),
          code: outcome.code,
          host,
          action: challengeResolution?.status === 'resolved'
            ? 'resolve_internal_challenge'
            : challengeResolution?.status === 'manual_required'
              ? 'manual_review'
              : internalHost && DEFAULT_SETTINGS.rotateStickyProxyOnInternalChallenge
                ? 'rotate_sticky_proxy'
                : internalHost && DEFAULT_SETTINGS.autoRecycleOnInternalChallenge
                  ? 'recycle_context'
                  : 'observe_only',
          reason: outcome.reason,
          runtimeSeed: crypto.randomUUID(),
          challengeResolution: challengeResolution ? {
            status: challengeResolution.status,
            remainingBalance: challengeResolution.remainingBalance,
            provider: challengeResolution.provider,
          } : null,
        };

        if (internalHost && options.tenantId && options.profileId && options.proxy?.__session?.endpointId) {
          await NetworkRoutingService.reportEndpointFailure(
            options.tenantId,
            options.proxy.__session.endpointId,
            `${outcome.reason}:${outcome.code}`,
            options.profileId
          ).catch(() => null);
        }

        (page as any).__camelMitigationState = state;
        logger.warn('Runtime mitigation signal detected', {
          tenantId: options.tenantId,
          profileId: options.profileId,
          host,
          code: outcome.code,
          action: state.action,
          reason: outcome.reason,
        });
      } catch (error: any) {
        logger.warn('Runtime mitigation listener failed', { error: error?.message });
      }
    });
  }
}

const sandboxAdapter = new SandboxRuntimeMitigationAdapter();
const productionAdapter = new ProductionRuntimeMitigationAdapter();

export class RuntimeMitigationService {
  static async attach(page: Page, context: BrowserContext, options: RuntimeMitigationAttachOptions) {
    const environment = await RuntimeEnvironmentService.resolve({
      tenantId: options.tenantId,
      fingerprint: options.fingerprint,
      explicitMode: options.environment,
    });
    const adapter = environment === 'sandbox' ? sandboxAdapter : productionAdapter;
    adapter.attach(page, context, options);
  }

  static getLastState(page: Page): RuntimeMitigationState | null {
    return ((page as any).__camelMitigationState || null) as RuntimeMitigationState | null;
  }
}

function classifyChallenge(response: Response) {
  const status = response.status();
  const headers = response.headers();
  const serverHeader = `${headers['server'] || ''} ${headers['cf-ray'] || ''} ${headers['x-akamai-session-info'] || ''}`.toLowerCase();

  if (status === 429) return { code: status, reason: 'rate_limited' as const };
  if (status === 403 && /cloudflare|akamai|perimeterx|datadome|incapsula|waf/.test(serverHeader)) {
    return { code: status, reason: 'waf_challenge' as const };
  }
  if (status === 403) return { code: status, reason: 'forbidden' as const };
  return null;
}

function isAllowedHost(allowedHosts: string[], host: string) {
  return allowedHosts.some((entry) => {
    const normalized = String(entry || '').trim().toLowerCase();
    return normalized && (host === normalized || host.endsWith(`.${normalized}`));
  });
}
