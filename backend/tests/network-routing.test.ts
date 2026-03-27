import { afterEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, redisMock } = vi.hoisted(() => ({
  prismaMock: {
    profile: { findUnique: vi.fn() },
    proxyPool: { findMany: vi.fn() },
    proxyEndpoint: { findFirst: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  },
  redisMock: {
    get: vi.fn(),
    set: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    del: vi.fn(),
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

vi.mock('../src/services/scaleMetrics.service', () => ({
  ScaleMetricsService: {
    incrementCounter: vi.fn(),
  },
}));

import { NetworkRoutingService } from '../src/services/networkRouting.service';

describe('NetworkRoutingService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns a sticky proxy binding for a profile pool', async () => {
    prismaMock.profile.findUnique.mockResolvedValue({
      id: 'profile-1',
      tenantId: 'tenant-1',
      platform: 'INSTAGRAM',
      geolocation: { country: 'ES', city: 'Madrid' },
      proxyPoolId: 'pool-1',
      proxyConfig: null,
    });
    prismaMock.proxyPool.findMany.mockResolvedValue([
      {
        id: 'pool-1',
        tenantId: 'tenant-1',
        type: 'MOBILE',
        settings: { rotationStrategy: 'STICKY_PER_PROFILE' },
        endpoints: [
          {
            id: 'endpoint-1',
            poolId: 'pool-1',
            host: '1.2.3.4',
            port: 8000,
            protocol: 'HTTP',
            status: 'ACTIVE',
            country: 'es',
            city: 'madrid',
          }
        ],
      }
    ]);
    redisMock.get.mockResolvedValueOnce(null);
    redisMock.set.mockResolvedValue('OK');

    const result = await NetworkRoutingService.resolve({
      tenantId: 'tenant-1',
      profileId: 'profile-1',
      sticky: true,
      country: 'ES',
      city: 'Madrid',
    });

    expect(result.endpoint?.id).toBe('endpoint-1');
    expect(result.selection.source).toBe('sticky_per_profile');
    expect(result.selection.sticky).toBe(true);
    expect(result.proxy?.__session?.endpointId).toBe('endpoint-1');
    expect(redisMock.set).toHaveBeenCalled();
  });

  it('falls back to direct profile proxy config when no pool is available', async () => {
    prismaMock.profile.findUnique.mockResolvedValue({
      id: 'profile-2',
      tenantId: 'tenant-1',
      platform: 'DESKTOP',
      proxyPoolId: null,
      proxyConfig: {
        server: 'http://direct-proxy.local:9000',
        username: 'user',
        password: 'pass',
      },
    });
    prismaMock.proxyPool.findMany.mockResolvedValue([]);

    const result = await NetworkRoutingService.resolve({
      tenantId: 'tenant-1',
      profileId: 'profile-2',
      sticky: true,
    });

    expect(result.endpoint).toBeNull();
    expect(result.selection.source).toBe('profile_proxy_config');
    expect(result.proxy?.server).toBe('http://direct-proxy.local:9000');
  });
});
