import { afterEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, redisMock } = vi.hoisted(() => ({
  prismaMock: {
    proxyPool: { findMany: vi.fn() },
  },
  redisMock: {
    scan: vi.fn(),
    lrange: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock('../src/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('../src/utils/redis', () => ({
  redis: redisMock,
}));

import { NetworkObservabilityService } from '../src/services/networkObservability.service';

describe('NetworkObservabilityService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('recommends mobile-friendly pools for mobile platforms', async () => {
    prismaMock.proxyPool.findMany.mockResolvedValue([
      {
        id: 'pool-mobile',
        name: 'Mobile ES',
        rotationStrategy: 'STICKY_PER_PROFILE',
        type: 'MOBILE',
        endpoints: [
          { id: 'e1', endpointType: 'MOBILE', status: 'ACTIVE', isActive: true, country: 'es', city: 'madrid', lastLatencyMs: 80 },
        ],
      },
      {
        id: 'pool-dc',
        name: 'Datacenter Global',
        type: 'DATACENTER',
        endpoints: [
          { id: 'e2', endpointType: 'DATACENTER', status: 'ACTIVE', isActive: true, country: 'us', city: 'ashburn', lastLatencyMs: 30 },
        ],
      },
    ]);
    redisMock.scan.mockResolvedValue(['0', []]);
    redisMock.get.mockResolvedValue(null);

    const recommendations = await NetworkObservabilityService.recommendPools({
      tenantId: 'tenant-1',
      platform: 'INSTAGRAM',
      country: 'es',
      city: 'madrid',
    });

    expect(recommendations[0]?.id).toBe('pool-mobile');
    expect(recommendations[0]?.score).toBeGreaterThan(recommendations[1]?.score || 0);
  });

  it('includes recent failovers in the observability snapshot', async () => {
    prismaMock.proxyPool.findMany.mockResolvedValue([
      {
        id: 'pool-1',
        name: 'Residential ES',
        type: 'RESIDENTIAL',
        rotationStrategy: 'ROUND_ROBIN',
        endpoints: [
          { id: 'e1', endpointType: 'RESIDENTIAL', status: 'DEGRADED', isActive: true, country: 'es', city: 'madrid', lastLatencyMs: 250 },
        ],
      },
    ]);
    redisMock.scan.mockResolvedValue(['0', ['v3:proxy:failover-history:tenant-1:profile-1']]);
    redisMock.lrange.mockResolvedValue([
      JSON.stringify({ endpointId: 'e1', reason: 'timeout', failedAt: '2026-03-19T00:00:00.000Z' }),
    ]);
    redisMock.get.mockResolvedValue(null);

    const snapshot = await NetworkObservabilityService.getSnapshot('tenant-1');

    expect(snapshot.summary.totalPools).toBe(1);
    expect(snapshot.failovers[0]?.profileId).toBe('profile-1');
    expect(snapshot.failovers[0]?.reason).toBe('timeout');
    expect(snapshot.degradedPools.length).toBe(1);
    expect(snapshot.profileFailovers[0]?.profileId).toBe('profile-1');
  });

  it('summarizes self-hosted VPN clusters separately', async () => {
    prismaMock.proxyPool.findMany.mockResolvedValue([
      {
        id: 'pool-vpn',
        name: 'Own VPN Cluster',
        type: 'VPN',
        rotationStrategy: 'STICKY_PER_PROFILE',
        endpoints: [
          { id: 'vpn-1', endpointType: 'VPN', provider: 'SELF_HOSTED', metadata: { cluster: 'wg-eu' }, status: 'ACTIVE', isActive: true, country: 'es', city: 'madrid', lastLatencyMs: 30 },
          { id: 'vpn-2', endpointType: 'VPN', provider: 'SELF_HOSTED', metadata: { cluster: 'wg-eu' }, status: 'ACTIVE', isActive: true, country: 'fr', city: 'paris', lastLatencyMs: 40 },
        ],
      },
    ]);
    redisMock.scan.mockResolvedValue(['0', []]);
    redisMock.get.mockResolvedValue(null);

    const snapshot = await NetworkObservabilityService.getSnapshot('tenant-1');

    expect(snapshot.vpnCluster.exitCount).toBe(2);
    expect(snapshot.vpnCluster.singleExitRisk).toBe(false);
    expect(snapshot.summary.selfHostedVpnExits).toBe(2);
  });
});
