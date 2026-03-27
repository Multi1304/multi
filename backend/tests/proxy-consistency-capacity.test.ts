import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, redisMock } = vi.hoisted(() => ({
  prismaMock: {
    tenant: { findUnique: vi.fn() },
    proxyEndpoint: { update: vi.fn() },
  },
  redisMock: {
    get: vi.fn(),
    del: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
  },
}));

vi.mock('../src/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('../src/utils/redis', () => ({
  redis: redisMock,
}));

vi.mock('../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
}));

import { ProxyHealthService } from '../src/services/proxyHealth.service';
import { ProfileConsistencyService } from '../src/services/profileConsistency.service';
import { TenantCapacityService } from '../src/services/tenantCapacity.service';

describe('proxy health, consistency and capacity', () => {
  beforeEach(() => {
    prismaMock.tenant.findUnique.mockResolvedValue({
      settings: {
        profileConsistency: {
          enabled: true,
          windowDays: 14,
          enforceFingerprint: true,
          enforceStickyProxy: true,
        },
      },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses cached proxy health when endpoint is fresh', async () => {
    const result = await ProxyHealthService.preflight({
      id: 'endpoint-1',
      status: 'ACTIVE',
      lastCheck: new Date().toISOString(),
      lastLatencyMs: 120,
      lastError: null,
    }, {
      tenantId: 'tenant-1',
      environment: 'production',
    });

    expect(result.ok).toBe(true);
    expect(result.cached).toBe(true);
    expect(prismaMock.proxyEndpoint.update).not.toHaveBeenCalled();
  });

  it('pins the first production fingerprint for the profile window', async () => {
    const first = await ProfileConsistencyService.stabilizeFingerprint('profile-1', 'tenant-1', {
      userAgent: 'UA-1',
      hardwareConcurrency: 8,
      screenResolution: '1920x1080',
      runtimeEnvironment: 'production',
    }, 'production');

    const second = await ProfileConsistencyService.stabilizeFingerprint('profile-1', 'tenant-1', {
      userAgent: 'UA-2',
      hardwareConcurrency: 16,
      screenResolution: '1440x900',
      runtimeEnvironment: 'production',
    }, 'production');

    expect(first.summary.enabled).toBe(true);
    expect(second.fingerprint.userAgent).toBe('UA-1');
    expect(['initialized', 'pinned']).toContain(second.summary.status);
  });

  it('validates signed enforced licenses', () => {
    const licenseKey = 'tenant-license';
    const signature = TenantCapacityService.computeLicenseSignature('tenant-1', 'pro', licenseKey, null);

    expect(TenantCapacityService.isLicenseCurrentlyValid({
      maxConcurrentProfiles: -1,
      maxConcurrentProfilesPerSeat: 3,
      rateLimitPerSeatPerMinute: 120,
      burstMultiplier: 1,
      licenseKey,
      licenseSignature: signature,
      licenseEnforced: true,
      licenseActive: true,
      licenseExpiresAt: null,
      suspended: false,
    }, { tenantId: 'tenant-1', plan: 'pro' })).toBe(true);

    expect(TenantCapacityService.isLicenseCurrentlyValid({
      maxConcurrentProfiles: -1,
      maxConcurrentProfilesPerSeat: 3,
      rateLimitPerSeatPerMinute: 120,
      burstMultiplier: 1,
      licenseKey,
      licenseSignature: 'bad-signature',
      licenseEnforced: true,
      licenseActive: true,
      licenseExpiresAt: null,
      suspended: false,
    }, { tenantId: 'tenant-1', plan: 'pro' })).toBe(false);
  });
});
