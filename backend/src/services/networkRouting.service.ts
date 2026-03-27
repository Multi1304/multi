import crypto from 'crypto';
import { prisma } from '../prisma';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';
import { ScaleMetricsService } from './scaleMetrics.service';
import { ProxyHealthService } from './proxyHealth.service';
import { ProfileConsistencyService } from './profileConsistency.service';
import { EgressLanePolicyService } from './egressLanePolicy.service';

export interface ProxyRoutingRequest {
  tenantId: string;
  profileId?: string | null;
  profile?: any;
  proxyEndpointId?: string | null;
  proxyPoolId?: string | null;
  country?: string | null;
  city?: string | null;
  platform?: string | null;
  blendTypes?: string[];
  allowVpn?: boolean;
  sticky?: boolean;
}

export interface ProxyRoutingResult {
  endpoint: any | null;
  proxy: any | undefined;
  selection: {
    source: string;
    sticky: boolean;
    failoverFrom?: string | null;
    poolIds: string[];
    country?: string | null;
    city?: string | null;
  };
}

export class NetworkRoutingService {
  private static stickyKey(tenantId: string, profileId: string) {
    return `v3:proxy:sticky:${tenantId}:${profileId}`;
  }

  private static roundRobinKey(poolId: string) {
    return `v3:proxy:rr:${poolId}`;
  }

  private static failureKey(endpointId: string) {
    return `v3:proxy:fail:${endpointId}`;
  }

  private static failoverHistoryKey(tenantId: string, profileId: string) {
    return `v3:proxy:failover-history:${tenantId}:${profileId}`;
  }

  static async resolve(request: ProxyRoutingRequest): Promise<ProxyRoutingResult> {
    const profile = request.profile || (request.profileId
      ? await (prisma as any).profile.findUnique({
          where: { id: request.profileId },
          include: { proxyPool: true, networkPolicy: true },
        })
      : null);

    const tenantId = request.tenantId;
    const profileId = request.profileId || profile?.id || null;
    if (request.proxyEndpointId) {
      const explicitEndpoint = await (prisma as any).proxyEndpoint.findFirst({
        where: { id: request.proxyEndpointId, tenantId },
      });
      if (explicitEndpoint) {
        return {
          endpoint: explicitEndpoint,
          proxy: this.formatProxy(explicitEndpoint, tenantId, profileId || undefined),
          selection: {
            source: 'explicit_endpoint',
            sticky: Boolean(profileId && request.sticky !== false),
            poolIds: explicitEndpoint.poolId ? [explicitEndpoint.poolId] : [],
            country: request.country || null,
            city: request.city || null,
          },
        };
      }
    }

    const directProxy = profile?.proxyConfig && profile.proxyConfig.server
      ? profile.proxyConfig
      : null;
    const poolIds = await this.resolvePoolIds(tenantId, {
      profile,
      proxyPoolId: request.proxyPoolId,
      blendTypes: request.blendTypes,
      platform: request.platform || profile?.platform || null,
      allowVpn: request.allowVpn,
    });

    if (!poolIds.length) {
      return {
        endpoint: null,
        proxy: directProxy || undefined,
        selection: { source: directProxy ? 'profile_proxy_config' : 'direct', sticky: false, poolIds: [] },
      };
    }

    const pools = await (prisma as any).proxyPool.findMany({
      where: { id: { in: poolIds }, tenantId },
      include: { endpoints: true },
    });

    const endpointCandidates = pools.flatMap((pool: any) =>
      (pool.endpoints || []).filter((endpoint: any) => this.isEndpointHealthy(endpoint)).map((endpoint: any) => ({
        ...endpoint,
        poolRotationStrategy: pool.rotationStrategy || pool.settings?.rotationStrategy || 'ROUND_ROBIN',
        poolType: pool.type || pool.settings?.type || 'RESIDENTIAL',
        poolSettings: pool.settings || {},
      }))
    );

    const geoFiltered = this.filterByGeo(endpointCandidates, request.country || profile?.geolocation?.country || profile?.geolocation?.countryCode, request.city || profile?.geolocation?.city);
    const preflight = await ProxyHealthService.preflightCandidates(geoFiltered.length ? geoFiltered : endpointCandidates, {
      tenantId,
    });
    const candidates = preflight.healthy.length
      ? preflight.healthy
      : preflight.degraded.length
        ? preflight.degraded
        : [];

    if (!candidates.length) {
      return {
        endpoint: null,
        proxy: undefined,
        selection: {
          source: 'no_healthy_endpoint',
          sticky: false,
          poolIds,
          country: request.country || null,
          city: request.city || null,
        },
      };
    }

    if (profileId && request.sticky !== false) {
      const sticky = await this.resolveStickyEndpoint(tenantId, profileId, candidates);
      if (sticky) {
        return {
          endpoint: sticky,
          proxy: this.formatProxy(sticky, tenantId, profileId),
          selection: {
            source: 'sticky_binding',
            sticky: true,
            poolIds,
            country: request.country || null,
            city: request.city || null,
          },
        };
      }
    }

    const selected = await this.selectEndpoint(candidates, pools, profileId);
    if (profileId && request.sticky !== false) {
      await this.bindSticky(tenantId, profileId, selected.id);
    }

    return {
      endpoint: selected,
      proxy: this.formatProxy(selected, tenantId, profileId || undefined),
      selection: {
        source: selected.poolRotationStrategy === 'ROUND_ROBIN'
          ? 'round_robin'
          : selected.poolRotationStrategy === 'RANDOM'
            ? 'random'
            : 'sticky_per_profile',
        sticky: Boolean(profileId && request.sticky !== false),
        poolIds,
        country: request.country || null,
        city: request.city || null,
      },
    };
  }

  static async reportEndpointFailure(tenantId: string, endpointId: string, reason: string, profileId?: string | null) {
    await redis.incr(this.failureKey(endpointId));
    const failures = Number(await redis.get(this.failureKey(endpointId)) || 0);
    await redis.expire(this.failureKey(endpointId), 60 * 60);

    try {
      await (prisma as any).proxyEndpoint.update({
        where: { id: endpointId },
        data: {
          lastCheck: new Date(),
          lastError: reason,
          failureCount: failures,
          status: failures >= 4 ? 'UNHEALTHY' : failures >= 2 ? 'DEGRADED' : 'ACTIVE',
        },
      });
    } catch (_error) {
      // tolerate schema drift
    }

    if (profileId) {
      await redis.del(this.stickyKey(tenantId, profileId));
      const historyKey = this.failoverHistoryKey(tenantId, profileId);
      await redis.lpush(historyKey, JSON.stringify({
        endpointId,
        reason,
        failedAt: new Date().toISOString(),
      }));
      await redis.ltrim(historyKey, 0, 24);
      await redis.expire(historyKey, 14 * 24 * 60 * 60);
    }
    await ScaleMetricsService.incrementCounter('proxy:endpoint_failure');
    logger.warn('Proxy endpoint failure recorded', { tenantId, endpointId, profileId, reason, failures });
  }

  static async reportEndpointSuccess(endpointId: string) {
    await redis.del(this.failureKey(endpointId));
    try {
      await (prisma as any).proxyEndpoint.update({
        where: { id: endpointId },
        data: {
          lastCheck: new Date(),
          lastError: null,
          failureCount: 0,
          status: 'ACTIVE',
        },
      });
    } catch (_error) {
      // tolerate schema drift
    }
  }

  static async healthCheckEndpoint(endpointId: string) {
    const endpoint = await (prisma as any).proxyEndpoint.findUnique({ where: { id: endpointId } });
    if (!endpoint) {
      throw new Error(`Proxy endpoint ${endpointId} not found`);
    }

    return ProxyHealthService.preflight(endpoint, {
      tenantId: endpoint.tenantId || null,
      force: true,
    });
  }

  static async healthCheckPool(poolId: string, tenantId: string) {
    const endpoints = await (prisma as any).proxyEndpoint.findMany({
      where: { poolId, tenantId },
    });
    const results = await Promise.all(endpoints.map((endpoint: any) => this.healthCheckEndpoint(endpoint.id)));
    return {
      poolId,
      total: results.length,
      healthy: results.filter((item) => item.ok).length,
      degraded: results.filter((item) => item.status === 'DEGRADED').length,
      unhealthy: results.filter((item) => item.status === 'UNHEALTHY').length,
      results,
    };
  }

  static formatProxy(endpoint: any, tenantId?: string, profileId?: string) {
    if (!endpoint) return undefined;
    return {
      server: `${String(endpoint.protocol || 'http').toLowerCase()}://${endpoint.host}:${endpoint.port}`,
      username: endpoint.username || undefined,
      password: endpoint.password || undefined,
      __session: {
        endpointId: endpoint.id,
        tenantId: tenantId || null,
        profileId: profileId || null,
        country: endpoint.country || null,
        city: endpoint.city || null,
        endpointType: endpoint.endpointType || endpoint.poolType || null,
        sticky: Boolean(profileId),
      },
    };
  }

  private static async resolvePoolIds(tenantId: string, options: { profile?: any; proxyPoolId?: string | null; blendTypes?: string[]; platform?: string | null; allowVpn?: boolean; }) {
    if (options.proxyPoolId) return [options.proxyPoolId];
    if (options.profile?.proxyPoolId) return [options.profile.proxyPoolId];

    const desiredTypes = options.blendTypes?.length
      ? options.blendTypes
      : this.inferBlendTypes(options.platform, options.allowVpn);

    if (options.profile?.id) {
      const lane = await EgressLanePolicyService.resolveLaneForProfile(tenantId, options.profile.id).catch(() => null);
      if (lane?.laneId === 'proxyless_default') {
        return [];
      }
      if (lane?.laneId?.startsWith('self_hosted_vpn_')) {
        const vpnPools = await (prisma as any).proxyPool.findMany({
          where: { tenantId },
          include: { endpoints: true },
          orderBy: [{ name: 'asc' }],
        });
        const matched = vpnPools.filter((pool: any) =>
          (pool.endpoints || []).some((endpoint: any) =>
            String(endpoint.endpointType || '').toUpperCase() === 'VPN' &&
            String(endpoint.provider || '').toUpperCase().includes('SELF_HOSTED') &&
            String(endpoint.metadata?.cluster || pool.id) === String(lane.targetClusterId || '')
          )
        );
        if (matched.length) return matched.map((pool: any) => pool.id);
      }
      if (lane?.laneId === 'commercial_overflow') {
        const commercialPools = await (prisma as any).proxyPool.findMany({
          where: { tenantId },
          include: { endpoints: true },
          orderBy: [{ name: 'asc' }],
        });
        const matched = commercialPools.filter((pool: any) => {
          const type = String(pool.type || pool.settings?.type || 'RESIDENTIAL').toUpperCase();
          const hasDesiredType = desiredTypes.includes(type) || (pool.endpoints || []).some((endpoint: any) => desiredTypes.includes(String(endpoint.endpointType || '').toUpperCase()));
          const hasSelfHostedVpn = (pool.endpoints || []).some((endpoint: any) =>
            String(endpoint.endpointType || '').toUpperCase() === 'VPN' &&
            String(endpoint.provider || '').toUpperCase().includes('SELF_HOSTED')
          );
          return hasDesiredType && !hasSelfHostedVpn;
        });
        if (matched.length) return matched.map((pool: any) => pool.id);
      }
    }

    const pools = await (prisma as any).proxyPool.findMany({
      where: { tenantId },
      orderBy: [{ name: 'asc' }],
    });

    const matched = pools.filter((pool: any) => {
      const type = String(pool.type || pool.settings?.type || 'RESIDENTIAL').toUpperCase();
      return desiredTypes.includes(type);
    });
    return (matched.length ? matched : pools).map((pool: any) => pool.id);
  }

  private static inferBlendTypes(platform?: string | null, allowVpn?: boolean) {
    const normalized = String(platform || '').toUpperCase();
    const types = normalized.includes('MOBILE') || normalized.includes('TIKTOK') || normalized.includes('INSTAGRAM')
      ? ['MOBILE', 'RESIDENTIAL']
      : ['RESIDENTIAL', 'DATACENTER'];
    if (allowVpn) types.push('VPN');
    return Array.from(new Set(types));
  }

  private static filterByGeo(endpoints: any[], country?: string | null, city?: string | null) {
    const normalizedCountry = String(country || '').trim().toLowerCase();
    const normalizedCity = String(city || '').trim().toLowerCase();
    if (!normalizedCountry && !normalizedCity) return endpoints;
    return endpoints.filter((endpoint) => {
      const endpointCountry = String(endpoint.country || endpoint.poolSettings?.country || '').trim().toLowerCase();
      const endpointCity = String(endpoint.city || endpoint.poolSettings?.city || '').trim().toLowerCase();
      const countryOk = !normalizedCountry || endpointCountry === normalizedCountry;
      const cityOk = !normalizedCity || endpointCity === normalizedCity;
      return countryOk && cityOk;
    });
  }

  private static async resolveStickyEndpoint(tenantId: string, profileId: string, candidates: any[]) {
    const stickyValue = await redis.get(this.stickyKey(tenantId, profileId));
    if (!stickyValue) return null;
    const sticky = JSON.parse(stickyValue);
    const selected = candidates.find((endpoint) => endpoint.id === sticky.endpointId);
    if (!selected) {
      await redis.del(this.stickyKey(tenantId, profileId));
      return null;
    }
    return selected;
  }

  private static async bindSticky(tenantId: string, profileId: string, endpointId: string) {
    const ttlSeconds = await ProfileConsistencyService.getStickyTtlSeconds(tenantId).catch(() => 7 * 24 * 60 * 60);
    await redis.set(this.stickyKey(tenantId, profileId), JSON.stringify({
      endpointId,
      boundAt: new Date().toISOString(),
    }), 'EX', ttlSeconds);
  }

  private static async selectEndpoint(candidates: any[], pools: any[], profileId: string | null) {
    const strategy = String(candidates[0]?.poolRotationStrategy || pools[0]?.rotationStrategy || 'ROUND_ROBIN').toUpperCase();
    if (strategy === 'RANDOM') {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    if (strategy === 'STICKY_PER_PROFILE' && profileId) {
      let hash = 0;
      for (let i = 0; i < profileId.length; i += 1) {
        hash = ((hash << 5) - hash) + profileId.charCodeAt(i);
        hash |= 0;
      }
      return candidates[Math.abs(hash) % candidates.length];
    }

    const poolId = candidates[0]?.poolId || pools[0]?.id;
    const nextIndex = await redis.incr(this.roundRobinKey(poolId));
    return candidates[(nextIndex - 1) % candidates.length];
  }

  private static isEndpointHealthy(endpoint: any) {
    const activeFlag = endpoint.isActive !== false;
    const status = String(endpoint.status || 'ACTIVE').toUpperCase();
    return activeFlag && !['UNHEALTHY', 'DISABLED', 'BLOCKED'].includes(status);
  }
}
