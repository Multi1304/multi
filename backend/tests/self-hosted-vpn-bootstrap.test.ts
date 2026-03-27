import { afterEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, getReportMock, getPlanMock, getSnapshotMock, getSizingMock } = vi.hoisted(() => ({
  prismaMock: {
    profile: { findMany: vi.fn() },
    proxyPool: { findMany: vi.fn(), create: vi.fn() },
    proxyEndpoint: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
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

describe('SelfHostedVpnBootstrapService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('builds a 2-4 exit bootstrap pack based on current tenant demand', async () => {
    getReportMock.mockResolvedValue({
      currentCapacity: {
        commercialPool: { percentOfConcurrency: 20 },
        selfHostedVpn: { percentOfConcurrency: 0 },
      },
    });
    getPlanMock.mockResolvedValue({ assignmentRules: ['proxyless first'] });
    getSnapshotMock.mockResolvedValue({ vpnCluster: { healthyExitCount: 0 } });
    getSizingMock.mockResolvedValue({ hybridPlan: { vpnSeats: 5 } });
    prismaMock.profile.findMany.mockResolvedValue([
      { id: 'p1', name: 'geo-es', platform: 'DESKTOP', geolocation: { country: 'es' } },
      { id: 'p2', name: 'geo-pt', platform: 'DESKTOP', geolocation: { country: 'pt' } },
    ]);
    prismaMock.proxyPool.findMany.mockResolvedValue([]);

    const result = await SelfHostedVpnBootstrapService.getPack('tenant-1');

    expect(result.recommendedExitCount).toBeGreaterThanOrEqual(2);
    expect(result.recommendedExitCount).toBeLessThanOrEqual(4);
    expect(result.templates.length).toBe(result.recommendedExitCount);
    expect(result.executionPlan[0]).toContain('2-4 self-hosted VPN exits');
  });

  it('creates suggested self-hosted pools when they do not exist yet', async () => {
    getReportMock.mockResolvedValue({
      currentCapacity: {
        commercialPool: { percentOfConcurrency: 20 },
        selfHostedVpn: { percentOfConcurrency: 0 },
      },
    });
    getPlanMock.mockResolvedValue({ assignmentRules: ['proxyless first'] });
    getSnapshotMock.mockResolvedValue({ vpnCluster: { healthyExitCount: 0 } });
    getSizingMock.mockResolvedValue({ hybridPlan: { vpnSeats: 5 } });
    prismaMock.profile.findMany.mockResolvedValue([
      { id: 'p1', name: 'geo-es', platform: 'DESKTOP', geolocation: { country: 'es' } },
    ]);
    prismaMock.proxyPool.findMany.mockResolvedValue([]);
    prismaMock.proxyPool.create.mockImplementation(async ({ data }: any) => ({ id: `pool-${data.name}`, ...data }));

    const result = await SelfHostedVpnBootstrapService.ensureSuggestedPools('tenant-1');

    expect(result.createdPools.length).toBeGreaterThan(0);
    expect(prismaMock.proxyPool.create).toHaveBeenCalled();
  });

  it('registers self-hosted exits into bootstrap-managed pools', async () => {
    prismaMock.proxyPool.findMany.mockResolvedValue([]);
    prismaMock.proxyPool.create.mockImplementation(async ({ data }: any) => ({ id: `pool-${data.name}`, ...data }));
    prismaMock.proxyEndpoint.findFirst.mockResolvedValue(null);
    prismaMock.proxyEndpoint.create.mockImplementation(async ({ data }: any) => ({ id: `endpoint-${data.host}`, ...data }));

    const result = await SelfHostedVpnBootstrapService.registerExits('tenant-1', [
      {
        name: 'wg-exit-1',
        host: 'vpn-1.example.net',
        port: 1080,
        country: 'es',
        group: 'stable_internal',
        cluster: 'wg-cluster-1',
      },
    ]);

    expect(result.createdEndpoints).toHaveLength(1);
    expect(prismaMock.proxyEndpoint.create).toHaveBeenCalled();
  });
});
