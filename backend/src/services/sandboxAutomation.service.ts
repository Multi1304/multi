import crypto from 'crypto';
import { prisma } from '../prisma';
import { redis } from '../utils/redis';
import { ScaleMetricsService } from './scaleMetrics.service';

export type SandboxProviderMode = 'disabled' | 'manual' | 'stub_auto';
export type SandboxChallengeType = 'captcha' | 'sms';
export type SandboxChallengeStatus = 'pending' | 'resolved' | 'disabled';

export interface SandboxAutomationSettings {
  captchaProvider: SandboxProviderMode;
  smsProvider: SandboxProviderMode;
  allowManualResolution: boolean;
  stubAutoResolveMs: number;
}

export interface SandboxChallenge {
  id: string;
  tenantId: string;
  type: SandboxChallengeType;
  provider: SandboxProviderMode;
  status: SandboxChallengeStatus;
  prompt: string;
  payload?: Record<string, any>;
  createdAt: string;
  resolvedAt?: string | null;
  resolution?: Record<string, any> | null;
}

const DEFAULT_SETTINGS: SandboxAutomationSettings = {
  captchaProvider: 'manual',
  smsProvider: 'manual',
  allowManualResolution: true,
  stubAutoResolveMs: 750,
};

export class SandboxAutomationService {
  private static key(tenantId: string, challengeId: string) {
    return `v3:sandbox:challenge:${tenantId}:${challengeId}`;
  }

  private static indexKey(challengeId: string) {
    return `v3:sandbox:challenge:index:${challengeId}`;
  }

  private static recentKey(tenantId: string) {
    return `v3:sandbox:challenge:recent:${tenantId}`;
  }

  static normalizeSettings(settings?: any): SandboxAutomationSettings {
    const raw = settings?.sandboxAutomation || {};
    return {
      captchaProvider: this.normalizeMode(raw.captchaProvider),
      smsProvider: this.normalizeMode(raw.smsProvider),
      allowManualResolution: raw.allowManualResolution !== false,
      stubAutoResolveMs: typeof raw.stubAutoResolveMs === 'number' && raw.stubAutoResolveMs > 0
        ? raw.stubAutoResolveMs
        : DEFAULT_SETTINGS.stubAutoResolveMs,
    };
  }

  private static normalizeMode(value: any): SandboxProviderMode {
    return value === 'disabled' || value === 'stub_auto' || value === 'manual'
      ? value
      : 'manual';
  }

  static async getSettings(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true }
    });
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
    return this.normalizeSettings(tenant.settings);
  }

  static async updateSettings(tenantId: string, partial: Partial<SandboxAutomationSettings>) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true }
    });
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

    const next = {
      ...this.normalizeSettings(tenant.settings),
      ...partial,
      captchaProvider: this.normalizeMode(partial.captchaProvider),
      smsProvider: this.normalizeMode(partial.smsProvider),
      stubAutoResolveMs: typeof partial.stubAutoResolveMs === 'number' && partial.stubAutoResolveMs > 0
        ? partial.stubAutoResolveMs
        : this.normalizeSettings(tenant.settings).stubAutoResolveMs,
    };

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...((tenant.settings as any) || {}),
          sandboxAutomation: next,
        } as any
      }
    });

    return next;
  }

  static async issueChallenge(
    tenantId: string,
    type: SandboxChallengeType,
    prompt: string,
    payload?: Record<string, any>
  ): Promise<SandboxChallenge> {
    const settings = await this.getSettings(tenantId);
    const provider = type === 'captcha' ? settings.captchaProvider : settings.smsProvider;
    const now = new Date().toISOString();
    const challenge: SandboxChallenge = {
      id: crypto.randomUUID(),
      tenantId,
      type,
      provider,
      status: provider === 'disabled' ? 'disabled' : provider === 'stub_auto' ? 'resolved' : 'pending',
      prompt,
      payload,
      createdAt: now,
      resolvedAt: provider === 'stub_auto' ? now : null,
      resolution: provider === 'stub_auto'
        ? { mode: 'stub_auto', value: type === 'captcha' ? 'stub-captcha-ok' : '000000' }
        : null,
    };

    await redis.set(this.key(tenantId, challenge.id), JSON.stringify(challenge), 'EX', 60 * 60 * 24);
    await redis.set(this.indexKey(challenge.id), tenantId, 'EX', 60 * 60 * 24);
    await redis.lpush(this.recentKey(tenantId), JSON.stringify(challenge));
    await redis.ltrim(this.recentKey(tenantId), 0, 24);
    await ScaleMetricsService.incrementCounter(`sandbox:${type}:issued`);
    if (challenge.status === 'resolved') {
      await ScaleMetricsService.incrementCounter(`sandbox:${type}:resolved`);
    }

    return challenge;
  }

  static async resolveChallenge(
    tenantId: string,
    challengeId: string,
    resolution: Record<string, any>
  ) {
    const raw = await redis.get(this.key(tenantId, challengeId));
    if (!raw) throw new Error(`Sandbox challenge ${challengeId} not found`);
    const challenge = JSON.parse(raw) as SandboxChallenge;
    const next: SandboxChallenge = {
      ...challenge,
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
      resolution,
    };
    await redis.set(this.key(tenantId, challengeId), JSON.stringify(next), 'EX', 60 * 60 * 24);
    await ScaleMetricsService.incrementCounter(`sandbox:${challenge.type}:resolved`);
    return next;
  }

  static async getChallenge(tenantId: string, challengeId: string): Promise<SandboxChallenge | null> {
    const raw = await redis.get(this.key(tenantId, challengeId));
    if (!raw) return null;
    return JSON.parse(raw) as SandboxChallenge;
  }

  static async getChallengeById(challengeId: string): Promise<SandboxChallenge | null> {
    const tenantId = await redis.get(this.indexKey(challengeId));
    if (!tenantId) return null;
    return this.getChallenge(tenantId, challengeId);
  }

  static async resolveChallengeById(challengeId: string, resolution: Record<string, any>) {
    const tenantId = await redis.get(this.indexKey(challengeId));
    if (!tenantId) throw new Error(`Sandbox challenge ${challengeId} not found`);
    return this.resolveChallenge(tenantId, challengeId, resolution);
  }

  static async listRecent(tenantId: string) {
    const rows = await redis.lrange(this.recentKey(tenantId), 0, 9);
    return rows.map((row) => JSON.parse(row) as SandboxChallenge);
  }
}
