import crypto from 'crypto';
import { prisma } from '../prisma';
import { redis } from '../utils/redis';
import { config } from '../config';

export interface TenantRuntimeCapacitySettings {
  maxConcurrentProfiles: number;
  maxConcurrentProfilesPerSeat: number;
  rateLimitPerSeatPerMinute: number;
  burstMultiplier: number;
  licenseKey: string | null;
  licenseSignature: string | null;
  licenseEnforced: boolean;
  licenseActive: boolean;
  licenseExpiresAt: string | null;
  suspended: boolean;
}

export interface TenantRuntimeCapacityStatus extends TenantRuntimeCapacitySettings {
  tenantId: string;
  plan: string;
  seatsAllowed: number;
  activeSeatCount: number;
  activeConcurrentProfiles: number;
  effectiveConcurrentProfileLimit: number;
  effectiveRequestsPerMinute: number;
}

const DEFAULT_SETTINGS: TenantRuntimeCapacitySettings = {
  maxConcurrentProfiles: -1,
  maxConcurrentProfilesPerSeat: 3,
  rateLimitPerSeatPerMinute: 120,
  burstMultiplier: 1,
  licenseKey: null,
  licenseSignature: null,
  licenseEnforced: false,
  licenseActive: true,
  licenseExpiresAt: null,
  suspended: false,
};

export class TenantCapacityService {
  private static activeProfileKey(tenantId: string, profileId: string) {
    return `v3:tenant:active-profile:${tenantId}:${profileId}`;
  }

  static normalizeSettings(settings?: any): TenantRuntimeCapacitySettings {
    const raw = settings?.runtimeCapacity || settings?.capacity || {};
    return {
      maxConcurrentProfiles: typeof raw.maxConcurrentProfiles === 'number' ? raw.maxConcurrentProfiles : DEFAULT_SETTINGS.maxConcurrentProfiles,
      maxConcurrentProfilesPerSeat: typeof raw.maxConcurrentProfilesPerSeat === 'number' ? raw.maxConcurrentProfilesPerSeat : DEFAULT_SETTINGS.maxConcurrentProfilesPerSeat,
      rateLimitPerSeatPerMinute: typeof raw.rateLimitPerSeatPerMinute === 'number' ? raw.rateLimitPerSeatPerMinute : DEFAULT_SETTINGS.rateLimitPerSeatPerMinute,
      burstMultiplier: typeof raw.burstMultiplier === 'number' ? raw.burstMultiplier : DEFAULT_SETTINGS.burstMultiplier,
      licenseKey: typeof raw.licenseKey === 'string' && raw.licenseKey.trim() ? raw.licenseKey.trim() : null,
      licenseSignature: typeof raw.licenseSignature === 'string' && raw.licenseSignature.trim() ? raw.licenseSignature.trim() : null,
      licenseEnforced: raw.licenseEnforced === true,
      licenseActive: raw.licenseActive !== false,
      licenseExpiresAt: typeof raw.licenseExpiresAt === 'string' && raw.licenseExpiresAt.trim() ? raw.licenseExpiresAt : null,
      suspended: raw.suspended === true,
    };
  }

  static computeLicenseSignature(tenantId: string, plan: string, key: string, expiresAt: string | null) {
    return crypto
      .createHmac('sha256', process.env.LICENSE_SIGNING_SECRET || config.encryption.key)
      .update(`${tenantId}:${plan}:${key}:${expiresAt || 'none'}`)
      .digest('hex');
  }

  static isLicenseCurrentlyValid(settings: TenantRuntimeCapacitySettings, context?: { tenantId?: string | null; plan?: string | null }) {
    if (!settings.licenseEnforced) return true;
    if (settings.suspended) return false;
    if (!settings.licenseActive) return false;
    if (!settings.licenseKey) return false;
    if (settings.licenseExpiresAt && new Date(settings.licenseExpiresAt) <= new Date()) return false;
    if (context?.tenantId && context?.plan && settings.licenseSignature) {
      const expected = this.computeLicenseSignature(context.tenantId, context.plan, settings.licenseKey, settings.licenseExpiresAt);
      if (expected !== settings.licenseSignature) return false;
    }
    return true;
  }

  static async countActiveProfiles(tenantId: string) {
    const pattern = this.activeProfileKey(tenantId, '*');
    let cursor = '0';
    let total = 0;

    do {
      const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = result[0];
      total += result[1].length;
    } while (cursor !== '0');

    return total;
  }

  static async getStatus(tenantId: string): Promise<TenantRuntimeCapacityStatus> {
    const [tenant, userCount] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, plan: true, seatsAllowed: true, settings: true }
      }),
      prisma.user.count({ where: { tenantId } })
    ]);

    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    const settings = this.normalizeSettings(tenant.settings);
    const activeConcurrentProfiles = await this.countActiveProfiles(tenantId);
    const activeSeatCount = tenant.seatsAllowed < 0
      ? Math.max(1, userCount)
      : Math.max(1, tenant.seatsAllowed || userCount || 1);
    const effectiveConcurrentProfileLimit = settings.maxConcurrentProfiles > 0
      ? settings.maxConcurrentProfiles
      : settings.maxConcurrentProfilesPerSeat > 0
        ? activeSeatCount * settings.maxConcurrentProfilesPerSeat
        : -1;

    return {
      tenantId,
      plan: tenant.plan,
      seatsAllowed: tenant.seatsAllowed,
      activeSeatCount,
      activeConcurrentProfiles,
      effectiveConcurrentProfileLimit,
      effectiveRequestsPerMinute: Math.round(settings.rateLimitPerSeatPerMinute * activeSeatCount * Math.max(0.1, settings.burstMultiplier || 1)),
      ...settings,
    };
  }

  static async updateSettings(tenantId: string, partial: Partial<TenantRuntimeCapacitySettings>) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true }
    });
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    const current = this.normalizeSettings(tenant.settings);
    const next = {
      ...current,
      ...partial,
    };

    const mergedSettings = {
      ...((tenant.settings as any) || {}),
      runtimeCapacity: next,
    };

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { settings: mergedSettings as any }
    });

    return this.getStatus(tenantId);
  }

  static async assertCanRunProfile(tenantId: string, profileId: string) {
    const status = await this.getStatus(tenantId);
    if (!this.isLicenseCurrentlyValid(status, { tenantId, plan: status.plan })) {
      throw new Error('Tenant license is not active for runtime execution');
    }

    if (status.effectiveConcurrentProfileLimit > 0) {
      const existing = await redis.get(this.activeProfileKey(tenantId, profileId));
      if (!existing && status.activeConcurrentProfiles >= status.effectiveConcurrentProfileLimit) {
        throw new Error(`Concurrent profile limit reached (${status.effectiveConcurrentProfileLimit})`);
      }
    }

    return status;
  }

  static async registerActiveProfile(tenantId: string, profileId: string, ttlMs: number) {
    await redis.set(this.activeProfileKey(tenantId, profileId), String(Date.now()), 'PX', ttlMs);
  }

  static async refreshActiveProfile(tenantId: string, profileId: string, ttlMs: number) {
    await redis.pexpire(this.activeProfileKey(tenantId, profileId), ttlMs);
  }

  static async releaseActiveProfile(tenantId: string, profileId: string) {
    await redis.del(this.activeProfileKey(tenantId, profileId));
  }
}
