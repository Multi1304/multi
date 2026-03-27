import { afterEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, getPlanMock } = vi.hoisted(() => ({
  prismaMock: {
    tenant: { findUnique: vi.fn() },
    profile: { findMany: vi.fn() },
  },
  getPlanMock: vi.fn(),
}));

vi.mock('../src/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('../src/services/egressLanePlanner.service', () => ({
  EgressLanePlannerService: {
    getPlan: getPlanMock,
  },
}));

import { EgressLanePolicyService } from '../src/services/egressLanePolicy.service';

describe('EgressLanePolicyService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('builds a recommended policy that keeps internal profiles proxyless and spills excess into commercial overflow', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({ settings: {} });
    prismaMock.profile.findMany.mockResolvedValue([
      { id: 'p1', name: 'sandbox-alpha', platform: 'DESKTOP', geolocation: null, proxyPoolId: null },
      { id: 'p2', name: 'mobile-es', platform: 'MOBILE', geolocation: { country: 'es' }, proxyPoolId: null },
      { id: 'p3', name: 'mobile-pt', platform: 'MOBILE', geolocation: { country: 'pt' }, proxyPoolId: null },
      { id: 'p4', name: 'overflow-user', platform: 'DESKTOP', geolocation: null, proxyPoolId: 'pool-1' },
    ]);
    getPlanMock.mockResolvedValue({
      lanes: {
        selfHostedVpn: [
          { laneId: 'self_hosted_vpn_1', clusterId: 'wg-a', label: 'Self-Hosted VPN 1', targetProfiles: 1 },
        ],
        commercialOverflow: { targetProfiles: 2 },
      },
    });

    const result = await EgressLanePolicyService.getEffectivePolicy('tenant-1');

    expect(result.source).toBe('recommended');
    expect(result.rules.find((rule) => rule.laneId === 'proxyless_default')?.profileIds).toContain('p1');
    expect(result.rules.find((rule) => rule.laneId === 'self_hosted_vpn_1')?.profileIds).toContain('p2');
    expect(result.rules.find((rule) => rule.laneId === 'commercial_overflow')?.profileIds).toContain('p4');
  });
});
