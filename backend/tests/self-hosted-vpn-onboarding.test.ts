import { afterEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, preflightMock } = vi.hoisted(() => ({
  prismaMock: {
    proxyEndpoint: { findMany: vi.fn() },
  },
  preflightMock: vi.fn(),
}));

vi.mock('../src/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('../src/services/proxyHealth.service', () => ({
  ProxyHealthService: {
    preflight: preflightMock,
  },
}));

import { SelfHostedVpnBootstrapService } from '../src/services/selfHostedVpnBootstrap.service';

describe('SelfHostedVpnBootstrapService onboarding', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('previews CSV import and normalizes exits', () => {
    const result = SelfHostedVpnBootstrapService.previewImport(
      'wg-exit-1,vpn-1.example.net,1080,es,madrid,stable_internal,wg-cluster-1,HTTP,,',
      'csv'
    );

    expect(result.valid).toBe(true);
    expect(result.exits).toHaveLength(1);
    expect(result.exits[0].group).toBe('stable_internal');
  });

  it('builds onboarding checklist for registered self-hosted exits', async () => {
    prismaMock.proxyEndpoint.findMany.mockResolvedValue([
      {
        id: 'endpoint-1',
        host: 'vpn-1.example.net',
        port: 1080,
        endpointType: 'VPN',
        provider: 'SELF_HOSTED_WIREGUARD',
        country: 'es',
        city: 'madrid',
        status: 'ACTIVE',
        metadata: { cluster: 'wg-cluster-1', group: 'stable_internal' },
        pool: { name: 'Self-Hosted Stable Internal' },
      },
    ]);
    preflightMock.mockResolvedValue({
      endpointId: 'endpoint-1',
      ok: true,
      latencyMs: 42,
      error: null,
      status: 'ACTIVE',
      checkedAt: new Date().toISOString(),
      cached: false,
    });

    const result = await SelfHostedVpnBootstrapService.getOnboardingChecklist('tenant-1', true);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].ready).toBe(true);
    expect(preflightMock).toHaveBeenCalled();
  });
});
