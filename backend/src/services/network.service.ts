import { prisma } from '../prisma';
import { logger } from '../utils/logger';

export class NetworkService {
  /**
   * Get an endpoint from a proxy pool based on its rotation strategy.
   * Special V2 feature: handles sticky sessions and random failover.
   */
  static async getProxyFromPool(poolId: string, tenantId: string, profileId?: string) {
    const pool: any = await (prisma as any).proxyPool.findUnique({
      where: { id: poolId, tenantId },
      include: { endpoints: true }
    });

    if (!pool || pool.endpoints.length === 0) {
      logger.warn('No active endpoints found in pool', { poolId });
      return null;
    }

    const strategy = pool.rotationStrategy;
    let selected;

    if (strategy === 'RANDOM') {
      // @ts-ignore
      selected = pool.endpoints[Math.floor(Math.random() * pool.endpoints.length)];
    } else if (strategy === 'STICKY_PER_PROFILE' && profileId) {
      // Use profileId to determine a stable index
      let hashCode = 0;
      for (let i = 0; i < profileId.length; i++) {
        hashCode = ((hashCode << 5) - hashCode) + profileId.charCodeAt(i);
        hashCode |= 0;
      }
      // @ts-ignore
      const index = Math.abs(hashCode) % pool.endpoints.length;
      // @ts-ignore
      selected = pool.endpoints[index];
    } else {
      // Default: ROUND_ROBIN (simplified logic for now without persistent counter)
      // @ts-ignore
      selected = pool.endpoints[Math.floor(Math.random() * pool.endpoints.length)];
    }

    return selected;
  }

  /**
   * Formats a proxy endpoint for Playwright/browser use.
   */
  static formatProxy(endpoint: any) {
    if (!endpoint) return undefined;

    // Playwright proxy format: { server: 'host:port', username: '...', password: '...' }
    return {
      server: `${endpoint.host}:${endpoint.port}`,
      username: endpoint.username || undefined,
      password: endpoint.password || undefined,
    };
  }

  /**
   * Resolves a network policy and applies smart defaults if necessary.
   */
  static async resolvePolicyDefaults(policyId: string | null | undefined) {
    if (!policyId) return null;

    const policy = await (prisma as any).networkPolicy.findUnique({
      where: { id: policyId }
    });

    if (policy && !policy.dnsPrimary) {
      // Apply Google DNS as a safe default if not specified
      logger.info('Applying smart DNS defaults (8.8.8.8) to network policy', { policyId });
      return { ...policy, dnsPrimary: '8.8.8.8', dnsSecondary: '8.8.4.4' };
    }

    return policy;
  }
}
