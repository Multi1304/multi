import { afterEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    proxyPool: { findMany: vi.fn() },
    profile: { count: vi.fn() },
  },
}));

vi.mock('../src/prisma', () => ({
  prisma: prismaMock,
}));

import { ProxyAdvisorService } from '../src/services/proxyAdvisor.service';

describe('ProxyAdvisorService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('explains proxyless mode when no pool exists', async () => {
    prismaMock.proxyPool.findMany.mockResolvedValue([]);
    prismaMock.profile.count.mockResolvedValue(4);

    const result = await ProxyAdvisorService.getAdvisor('tenant-1');

    expect(result.mode).toBe('proxyless');
    expect(result.canOperateWithoutProxies).toBe(true);
    expect(result.guidance.degradedWithoutProxies.some((item: string) => item.includes('Network isolation'))).toBe(true);
    expect(result.targetPool.minimumHealthyEndpoints).toBeGreaterThan(1);
  });

  it('marks a tenant as healthy when the pool has enough active endpoints', async () => {
    prismaMock.proxyPool.findMany.mockResolvedValue([
      {
        id: 'pool-1',
        endpoints: [
          { id: 'e1', isActive: true, status: 'ACTIVE', country: 'es' },
          { id: 'e2', isActive: true, status: 'ACTIVE', country: 'es' },
          { id: 'e3', isActive: true, status: 'ACTIVE', country: 'es' },
        ],
      },
    ]);
    prismaMock.profile.count.mockResolvedValue(3);

    const result = await ProxyAdvisorService.getAdvisor('tenant-1');

    expect(result.mode).toBe('healthy_pool');
    expect(result.counts.activeEndpoints).toBe(3);
    expect(result.guidance.recommendations.some((item: string) => item.includes('health checks'))).toBe(true);
  });
});
