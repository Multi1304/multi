import { afterEach, describe, expect, it, vi } from 'vitest';

const { getStatusMock, getPlanMock } = vi.hoisted(() => ({
  getStatusMock: vi.fn(),
  getPlanMock: vi.fn(),
}));

vi.mock('../src/services/tenantCapacity.service', () => ({
  TenantCapacityService: {
    getStatus: getStatusMock,
  },
}));

vi.mock('../src/services/networkStrategyWizard.service', () => ({
  NetworkStrategyWizardService: {
    getPlan: getPlanMock,
  },
}));

import { PoolSizingPlannerService } from '../src/services/poolSizingPlanner.service';

describe('PoolSizingPlannerService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('suggests hybrid sizing for medium scale tenants', async () => {
    getStatusMock.mockResolvedValue({
      activeSeatCount: 12,
      effectiveConcurrentProfileLimit: 18,
    });
    getPlanMock.mockResolvedValue({
      scaleBand: 'medium',
      recommendation: 'Hybrid is usually the best cost-to-control tradeoff.',
      proxyAdvisor: {
        targetPool: {
          minimumHealthyEndpoints: 4,
          suggestedStickyStrategy: 'STICKY_PER_PROFILE',
        },
      },
    });

    const result = await PoolSizingPlannerService.getPlan('tenant-1');

    expect(result.suggestedArchitecture).toBe('hybrid');
    expect(result.targets.recommendedHealthyEndpoints).toBeGreaterThanOrEqual(4);
    expect(result.hybridPlan.proxyBackedSeats).toBeGreaterThan(0);
  });

  it('keeps low scale deployments light', async () => {
    getStatusMock.mockResolvedValue({
      activeSeatCount: 2,
      effectiveConcurrentProfileLimit: 4,
    });
    getPlanMock.mockResolvedValue({
      scaleBand: 'low',
      recommendation: 'Start with proxyless or one self-hosted VPN.',
      proxyAdvisor: {
        targetPool: {
          minimumHealthyEndpoints: 2,
          suggestedStickyStrategy: 'ROUND_ROBIN',
        },
      },
    });

    const result = await PoolSizingPlannerService.getPlan('tenant-1');

    expect(result.suggestedArchitecture).toBe('proxyless_or_single_vpn');
    expect(result.targets.recommendedHealthyEndpoints).toBeGreaterThanOrEqual(2);
  });
});
