import { afterEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    tenant: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../src/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('../src/services/scaleMetrics.service', () => ({
  ScaleMetricsService: {
    observeDuration: vi.fn(),
    setGauge: vi.fn(),
  },
}));

import { HumanBehaviorPolicyService } from '../src/services/humanBehaviorPolicy.service';
import { ChallengeResolutionService } from '../src/services/challengeResolution.service';

describe('production behavior and first-party challenge services', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('replays deterministic production behavior profiles', async () => {
    const first = await HumanBehaviorPolicyService.nextKeypressDelay({
      profileId: 'profile-1',
      environment: 'production',
    });
    const second = await HumanBehaviorPolicyService.nextMouseSteps({
      profileId: 'profile-1',
      environment: 'production',
    });

    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(0);
  });

  it('consumes internal challenge balance only for allowlisted hosts', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({
      settings: {
        firstPartyChallengeResolution: {
          mode: 'credit_pool',
          balance: 2,
          allowedHosts: ['localhost'],
          fallbackAction: 'rotate_sticky_proxy',
        },
      },
    });
    prismaMock.tenant.update.mockResolvedValue({});

    const result = await ChallengeResolutionService.resolve({
      tenantId: 'tenant-1',
      host: 'localhost',
      code: 429,
      reason: 'rate_limited',
      environment: 'production',
    });

    expect(result.status).toBe('resolved');
    expect(result.remainingBalance).toBe(1);
    expect(prismaMock.tenant.update).toHaveBeenCalled();
  });
});
