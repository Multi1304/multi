import { afterEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, getReportMock, getPlanMock, getSnapshotMock, getSizingMock } = vi.hoisted(() => ({
  prismaMock: {
    profile: { findMany: vi.fn() },
  },
  getReportMock: vi.fn(),
  getPlanMock: vi.fn(),
  getSnapshotMock: vi.fn(),
  getSizingMock: vi.fn(),
}));

vi.mock('../src/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('../src/services/egressDependencyReport.service', () => ({
  EgressDependencyReportService: {
    getReport: getReportMock,
  },
}));

vi.mock('../src/services/egressLanePlanner.service', () => ({
  EgressLanePlannerService: {
    getPlan: getPlanMock,
  },
}));

vi.mock('../src/services/networkObservability.service', () => ({
  NetworkObservabilityService: {
    getSnapshot: getSnapshotMock,
  },
}));

vi.mock('../src/services/poolSizingPlanner.service', () => ({
  PoolSizingPlannerService: {
    getPlan: getSizingMock,
  },
}));

import { SelfHostedVpnBootstrapService } from '../src/services/selfHostedVpnBootstrap.service';

describe('SelfHostedVpnBootstrapService topology', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('builds a parallel host topology plan', async () => {
    getReportMock.mockResolvedValue({
      currentCapacity: {
        commercialPool: { percentOfConcurrency: 20 },
        selfHostedVpn: { percentOfConcurrency: 0 },
      },
    });
    getPlanMock.mockResolvedValue({ assignmentRules: ['proxyless first'] });
    getSnapshotMock.mockResolvedValue({ vpnCluster: { healthyExitCount: 0 } });
    getSizingMock.mockResolvedValue({ hybridPlan: { vpnSeats: 6 } });
    prismaMock.profile.findMany.mockResolvedValue([
      { id: 'p1', name: 'geo-es', platform: 'DESKTOP', geolocation: { country: 'es' } },
      { id: 'p2', name: 'geo-pt', platform: 'DESKTOP', geolocation: { country: 'pt' } },
    ]);

    const result = await SelfHostedVpnBootstrapService.getTopologyPlan('tenant-1');

    expect(result.hosts.length).toBeGreaterThanOrEqual(2);
    expect(result.hosts[0].group).toBe('stable_internal');
    expect(result.rolloutPhases.length).toBeGreaterThan(0);
  });
});
