import { afterEach, describe, expect, it, vi } from 'vitest';

const { getStatusMock, getAdvisorMock, getPlanMock, getSizingMock, getSnapshotMock } = vi.hoisted(() => ({
  getStatusMock: vi.fn(),
  getAdvisorMock: vi.fn(),
  getPlanMock: vi.fn(),
  getSizingMock: vi.fn(),
  getSnapshotMock: vi.fn(),
}));

vi.mock('../src/services/tenantCapacity.service', () => ({
  TenantCapacityService: {
    getStatus: getStatusMock,
  },
}));

vi.mock('../src/services/proxyAdvisor.service', () => ({
  ProxyAdvisorService: {
    getAdvisor: getAdvisorMock,
  },
}));

vi.mock('../src/services/networkStrategyWizard.service', () => ({
  NetworkStrategyWizardService: {
    getPlan: getPlanMock,
  },
}));

vi.mock('../src/services/poolSizingPlanner.service', () => ({
  PoolSizingPlannerService: {
    getPlan: getSizingMock,
  },
}));

vi.mock('../src/services/networkObservability.service', () => ({
  NetworkObservabilityService: {
    getSnapshot: getSnapshotMock,
  },
}));

import { EgressDependencyReportService } from '../src/services/egressDependencyReport.service';

describe('EgressDependencyReportService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows no commercial dependence when self-hosted exits cover the planned routed load', async () => {
    getStatusMock.mockResolvedValue({
      activeSeatCount: 6,
      effectiveConcurrentProfileLimit: 8,
    });
    getAdvisorMock.mockResolvedValue({});
    getPlanMock.mockResolvedValue({ scaleBand: 'low' });
    getSizingMock.mockResolvedValue({
      hybridPlan: { vpnSeats: 2 },
      targets: { targetConcurrentProxyProfiles: 2 },
    });
    getSnapshotMock.mockResolvedValue({
      vpnCluster: { totalExits: 2, exitCount: 2, healthyExitCount: 2 },
      pools: [
        { provider: 'SELF_HOSTED_WIREGUARD', endpointTypes: ['VPN'], counts: { active: 2 } },
      ],
    });

    const report = await EgressDependencyReportService.getReport('tenant-1');

    expect(report.commercialDependenceLevel).toBe('none');
    expect(report.currentCapacity.selfHostedVpn.recommendedProfiles).toBe(2);
    expect(report.currentCapacity.commercialPool.recommendedProfiles).toBe(0);
  });

  it('marks medium or high dependence when routed load exceeds self-hosted vpn capacity', async () => {
    getStatusMock.mockResolvedValue({
      activeSeatCount: 20,
      effectiveConcurrentProfileLimit: 24,
    });
    getAdvisorMock.mockResolvedValue({});
    getPlanMock.mockResolvedValue({ scaleBand: 'high' });
    getSizingMock.mockResolvedValue({
      hybridPlan: { vpnSeats: 5 },
      targets: { targetConcurrentProxyProfiles: 12 },
    });
    getSnapshotMock.mockResolvedValue({
      vpnCluster: { totalExits: 2, exitCount: 2, healthyExitCount: 2 },
      pools: [
        { provider: 'SELF_HOSTED_WIREGUARD', endpointTypes: ['VPN'], counts: { active: 2 } },
        { provider: 'COMMERCIAL_POOL', endpointTypes: ['RESIDENTIAL'], counts: { active: 3 } },
      ],
    });

    const report = await EgressDependencyReportService.getReport('tenant-1');

    expect(report.dependsOnCommercialPool).toBe(true);
    expect(report.currentCapacity.commercialPool.recommendedProfiles).toBeGreaterThan(0);
    expect(['medium', 'high']).toContain(report.commercialDependenceLevel);
    expect(report.strongSeparation.currentCapacity).toBe(5);
  });
});
