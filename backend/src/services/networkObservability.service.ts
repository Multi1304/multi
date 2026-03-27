import { prisma } from '../prisma';
import { redis } from '../utils/redis';
import { NetworkMetadataCatalogService } from './networkMetadataCatalog.service';

type PoolRecommendationInput = {
  tenantId: string;
  platform?: string | null;
  country?: string | null;
  city?: string | null;
  allowVpn?: boolean;
};

export class NetworkObservabilityService {
  static async getSnapshot(tenantId: string) {
    const pools = await (prisma as any).proxyPool.findMany({
      where: { tenantId },
      include: { endpoints: true },
      orderBy: [{ name: 'asc' }],
    });
    const stickyBindings = await this.listStickyBindings(tenantId);
    const stickyByEndpoint = new Map<string, number>();
    for (const binding of stickyBindings) {
      stickyByEndpoint.set(binding.endpointId, (stickyByEndpoint.get(binding.endpointId) || 0) + 1);
    }

    const poolRows = pools.map((pool: any) => {
      const endpoints = pool.endpoints || [];
      const active = endpoints.filter((endpoint: any) => this.isActive(endpoint)).length;
      const degraded = endpoints.filter((endpoint: any) => String(endpoint.status || '').toUpperCase() === 'DEGRADED').length;
      const unhealthy = endpoints.filter((endpoint: any) => ['UNHEALTHY', 'DISABLED', 'BLOCKED'].includes(String(endpoint.status || '').toUpperCase())).length;
      const countries = Array.from(new Set(endpoints.map((endpoint: any) => endpoint.country).filter(Boolean))).slice(0, 8);
      const cities = Array.from(new Set(endpoints.map((endpoint: any) => endpoint.city).filter(Boolean))).slice(0, 8);
      const endpointTypes = Array.from(new Set(endpoints.map((endpoint: any) => endpoint.endpointType || pool.type || 'RESIDENTIAL').filter(Boolean)));
      const geoTaggedCount = endpoints.filter((endpoint: any) => endpoint.country || endpoint.city).length;
      const stickyBindingsCount = endpoints.reduce((sum: number, endpoint: any) => sum + (stickyByEndpoint.get(endpoint.id) || 0), 0);
      const avgLatencyMs = endpoints.filter((endpoint: any) => Number(endpoint.lastLatencyMs) > 0)
        .reduce((sum: number, endpoint: any, _index: number, arr: any[]) => sum + Number(endpoint.lastLatencyMs || 0) / Math.max(1, arr.length), 0);

      const healthRatio = endpoints.length ? active / endpoints.length : 0;
      const loadFactor = active > 0 ? stickyBindingsCount / active : stickyBindingsCount > 0 ? 1.5 : 0;
      const availabilityScore = Math.round(
        (healthRatio * 70) +
        (unhealthy === 0 ? 15 : Math.max(0, 15 - unhealthy * 5)) +
        (avgLatencyMs > 0 ? Math.max(0, 15 - Math.round(avgLatencyMs / 75)) : 10) -
        Math.min(15, Math.round(loadFactor * 6))
      );

      return {
        id: pool.id,
        name: pool.name,
        type: pool.type || 'RESIDENTIAL',
        provider: pool.provider || null,
        rotationStrategy: pool.rotationStrategy || pool.settings?.rotationStrategy || 'ROUND_ROBIN',
        description: pool.description || pool.settings?.description || '',
        counts: {
          total: endpoints.length,
          active,
          degraded,
          unhealthy,
        },
        geoCoverage: { countries, cities },
        endpointTypes,
        metadataCoverage: endpoints.length ? Math.round((geoTaggedCount / endpoints.length) * 100) : 0,
        currentStickyBindings: stickyBindingsCount,
        loadFactor: Number(loadFactor.toFixed(2)),
        avgLatencyMs: Math.round(avgLatencyMs),
        availabilityScore,
      };
    });

    const degradedPools = poolRows
      .filter((row) => row.counts.degraded > 0 || row.counts.unhealthy > 0 || row.availabilityScore < 65)
      .sort((a, b) => a.availabilityScore - b.availabilityScore)
      .slice(0, 8);

    const recommendationProfiles = await Promise.all(
      NetworkMetadataCatalogService.getCatalog().platformProfiles.map(async (profile) => ({
        key: profile.key,
        label: profile.label,
        platform: profile.platform,
        items: await this.recommendPools({ tenantId, platform: profile.platform }),
      }))
    );

    const recommendations = recommendationProfiles.reduce((acc: Record<string, any[]>, profile) => {
      acc[profile.key] = profile.items;
      return acc;
    }, {});

    const alerts = poolRows.flatMap((pool) => this.buildPoolAlerts(pool));
    const failovers = await this.listRecentFailovers(tenantId);
    const profileFailovers = this.groupFailoversByProfile(failovers);
    const platformRiskRanking = this.buildPlatformRiskRanking(poolRows);
    const vpnCluster = this.buildSelfHostedVpnCluster(poolRows, pools);

    return {
      summary: {
        totalPools: poolRows.length,
        degradedPools: degradedPools.length,
        totalFailovers: failovers.length,
        affectedProfiles: profileFailovers.length,
        selfHostedVpnExits: vpnCluster.exitCount,
        averageMetadataCoverage: poolRows.length
          ? Math.round(poolRows.reduce((sum, pool) => sum + (pool.metadataCoverage || 0), 0) / poolRows.length)
          : 0,
      },
      pools: poolRows,
      degradedPools,
      recommendations,
      recommendationProfiles,
      alerts,
      failovers,
      profileFailovers,
      platformRiskRanking,
      vpnCluster,
    };
  }

  static async recommendPools(input: PoolRecommendationInput) {
    const profile = NetworkMetadataCatalogService.getPlatformProfile(input.platform);
    const stickyBindings = await this.listStickyBindings(input.tenantId);
    const stickyByEndpoint = new Map<string, number>();
    for (const binding of stickyBindings) {
      stickyByEndpoint.set(binding.endpointId, (stickyByEndpoint.get(binding.endpointId) || 0) + 1);
    }
    const pools = await (prisma as any).proxyPool.findMany({
      where: { tenantId: input.tenantId },
      include: { endpoints: true },
    });

    const desiredTypes = this.inferDesiredTypes(input.platform, input.allowVpn);
    return pools
      .map((pool: any) => {
        const endpoints = (pool.endpoints || []).filter((endpoint: any) => this.isActive(endpoint));
        const poolTypes = Array.from(new Set(endpoints.map((endpoint: any) => String(endpoint.endpointType || pool.type || 'RESIDENTIAL').toUpperCase())));
        const typeScore = desiredTypes.some((type) => poolTypes.includes(type) || String(pool.type || '').toUpperCase() === type) ? 40 : 10;

        const geoMatches = endpoints.filter((endpoint: any) => {
          const countryOk = !input.country || String(endpoint.country || '').toLowerCase() === String(input.country).toLowerCase();
          const cityOk = !input.city || String(endpoint.city || '').toLowerCase() === String(input.city).toLowerCase();
          return countryOk && cityOk;
        }).length;
        const geoScore = input.country || input.city
          ? Math.min(30, geoMatches * 10)
          : profile.geoSensitivity === 'high'
            ? Math.min(24, endpoints.filter((endpoint: any) => endpoint.country || endpoint.city).length * 6)
            : 18;
        const healthScore = Math.min(20, endpoints.length * 4);
        const stickyScore = profile.stickyRecommended && String(pool.rotationStrategy || pool.settings?.rotationStrategy || '').toUpperCase() === 'STICKY_PER_PROFILE'
          ? 8
          : profile.stickyRecommended
            ? 3
            : 0;
        const metadataScore = Math.min(10, endpoints.filter((endpoint: any) => endpoint.country || endpoint.city || endpoint.provider).length * 2);
        const stickyBindingsCount = endpoints.reduce((sum: number, endpoint: any) => sum + (stickyByEndpoint.get(endpoint.id) || 0), 0);
        const loadFactor = endpoints.length ? stickyBindingsCount / Math.max(1, endpoints.length) : stickyBindingsCount;
        const loadPenalty = Math.min(14, Math.round(loadFactor * 5));
        const latencyPenalty = endpoints.reduce((sum: number, endpoint: any) => sum + Math.min(8, Math.round(Number(endpoint.lastLatencyMs || 0) / 120)), 0);
        const score = Math.max(0, typeScore + geoScore + healthScore + stickyScore + metadataScore - latencyPenalty - loadPenalty);

        return {
          id: pool.id,
          name: pool.name,
          type: pool.type || 'RESIDENTIAL',
          score,
          platformLabel: profile.label,
          stickyBindings: stickyBindingsCount,
          loadFactor: Number(loadFactor.toFixed(2)),
          reasons: [
            `Blend fit: ${desiredTypes.join(' / ')}`,
            geoMatches > 0 ? `Geo coverage matches ${geoMatches} active endpoint(s)` : 'No direct geo match found',
            `${endpoints.length} active endpoint(s) available`,
            profile.stickyRecommended ? 'Sticky routing recommended for this platform' : 'Sticky routing optional for this platform',
            stickyBindingsCount > 0 ? `${stickyBindingsCount} sticky binding(s) currently attached` : 'No current sticky load recorded',
          ],
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }

  private static buildPoolAlerts(pool: any) {
    const alerts: Array<{ poolId: string; severity: 'warning' | 'critical'; message: string }> = [];
    if (pool.type === 'MOBILE' && !pool.endpointTypes.includes('MOBILE')) {
      alerts.push({ poolId: pool.id, severity: 'warning', message: `Pool ${pool.name} is marked MOBILE but its endpoints do not expose MOBILE metadata yet.` });
    }
    if (pool.type === 'RESIDENTIAL' && pool.counts.active === 0) {
      alerts.push({ poolId: pool.id, severity: 'critical', message: `Pool ${pool.name} has no active residential capacity right now.` });
    }
    if (pool.availabilityScore < 55) {
      alerts.push({ poolId: pool.id, severity: 'critical', message: `Pool ${pool.name} dropped below the safe availability threshold.` });
    }
    if ((pool.metadataCoverage || 0) < 50) {
      alerts.push({ poolId: pool.id, severity: 'warning', message: `Pool ${pool.name} still lacks enough country/city/provider metadata for precise geo targeting.` });
    }
    return alerts;
  }

  private static buildSelfHostedVpnCluster(poolRows: any[], rawPools: any[]) {
    const vpnEndpoints = rawPools
      .flatMap((pool: any) => (pool.endpoints || []).map((endpoint: any) => ({
        ...endpoint,
        poolName: pool.name,
        poolId: pool.id,
      })))
      .filter((endpoint: any) => String(endpoint.endpointType || '').toUpperCase() === 'VPN' && String(endpoint.provider || '').toUpperCase().includes('SELF_HOSTED'));

    const clusters = new Map<string, any>();
    for (const endpoint of vpnEndpoints) {
      const clusterId = endpoint.metadata?.cluster || endpoint.poolId || 'default';
      const current = clusters.get(clusterId) || {
        clusterId,
        exits: 0,
        healthy: 0,
        countries: new Set<string>(),
        cities: new Set<string>(),
      };
      current.exits += 1;
      if (this.isActive(endpoint)) current.healthy += 1;
      if (endpoint.country) current.countries.add(endpoint.country);
      if (endpoint.city) current.cities.add(endpoint.city);
      clusters.set(clusterId, current);
    }

    return {
      exitCount: vpnEndpoints.length,
      healthyExitCount: vpnEndpoints.filter((endpoint: any) => this.isActive(endpoint)).length,
      singleExitRisk: vpnEndpoints.length <= 1,
      clusters: Array.from(clusters.values()).map((item) => ({
        clusterId: item.clusterId,
        exits: item.exits,
        healthy: item.healthy,
        countries: Array.from(item.countries),
        cities: Array.from(item.cities).slice(0, 6),
      })),
      note: vpnEndpoints.length <= 1
        ? 'One self-hosted VPN exit is useful, but it is still one shared network identity.'
        : 'Multiple self-hosted VPN exits let Camel treat your own egress like a small managed pool.',
    };
  }

  private static async listRecentFailovers(tenantId: string) {
    const keys = await this.scanKeys(`v3:proxy:failover-history:${tenantId}:*`, 25);
    const rows: any[] = [];
    for (const key of keys) {
      const profileId = key.split(':').slice(-1)[0];
      const items = await redis.lrange(key, 0, 4);
      for (const item of items) {
        try {
          rows.push({
            profileId,
            ...JSON.parse(item),
          });
        } catch {
          // ignore malformed
        }
      }
    }
    return rows
      .sort((a, b) => String(b.failedAt).localeCompare(String(a.failedAt)))
      .slice(0, 20);
  }

  private static async scanKeys(pattern: string, limit = 50) {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 25);
      cursor = nextCursor;
      keys.push(...batch);
      if (keys.length >= limit) break;
    } while (cursor !== '0');
    return keys.slice(0, limit);
  }

  private static async listStickyBindings(tenantId: string) {
    const keys = await this.scanKeys(`v3:proxy:sticky:${tenantId}:*`, 200);
    const rows: Array<{ profileId: string; endpointId: string; boundAt?: string | null }> = [];
    for (const key of keys) {
      const profileId = key.split(':').slice(-1)[0];
      const raw = await redis.get(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.endpointId) {
          rows.push({
            profileId,
            endpointId: parsed.endpointId,
            boundAt: parsed.boundAt || null,
          });
        }
      } catch {
        // ignore malformed sticky payloads
      }
    }
    return rows;
  }

  private static groupFailoversByProfile(failovers: any[]) {
    const grouped = new Map<string, any>();
    for (const failover of failovers) {
      const current = grouped.get(failover.profileId) || {
        profileId: failover.profileId,
        count: 0,
        lastFailedAt: failover.failedAt,
        lastReason: failover.reason,
        endpoints: new Set<string>(),
      };
      current.count += 1;
      current.lastFailedAt = current.lastFailedAt > failover.failedAt ? current.lastFailedAt : failover.failedAt;
      current.lastReason = failover.reason || current.lastReason;
      current.endpoints.add(failover.endpointId);
      grouped.set(failover.profileId, current);
    }

    return Array.from(grouped.values())
      .map((item) => ({
        profileId: item.profileId,
        count: item.count,
        lastFailedAt: item.lastFailedAt,
        lastReason: item.lastReason,
        endpoints: Array.from(item.endpoints).slice(0, 5),
      }))
      .sort((a, b) => String(b.lastFailedAt).localeCompare(String(a.lastFailedAt)));
  }

  private static buildPlatformRiskRanking(poolRows: any[]) {
    return NetworkMetadataCatalogService.getCatalog().platformProfiles.map((profile) => {
      const riskyPools = poolRows
        .filter((pool) => {
          const poolTypes = (pool.endpointTypes || []).map((type: string) => String(type).toUpperCase());
          return profile.preferredEndpointTypes.some((type) => poolTypes.includes(type) || String(pool.type || '').toUpperCase() === type);
        })
        .map((pool) => ({
          id: pool.id,
          name: pool.name,
          type: pool.type,
          availabilityScore: pool.availabilityScore,
          loadFactor: pool.loadFactor,
          metadataCoverage: pool.metadataCoverage,
        }))
        .sort((a, b) => (a.availabilityScore + a.metadataCoverage) - (b.availabilityScore + b.metadataCoverage))
        .slice(0, 3);

      return {
        key: profile.key,
        label: profile.label,
        platform: profile.platform,
        riskyPools,
      };
    });
  }

  private static inferDesiredTypes(platform?: string | null, allowVpn?: boolean) {
    const profile = NetworkMetadataCatalogService.getPlatformProfile(platform);
    const types = [...profile.preferredEndpointTypes, ...profile.fallbackEndpointTypes];
    if (allowVpn) types.push('VPN');
    return Array.from(new Set(types));
  }

  private static isActive(endpoint: any) {
    return endpoint?.isActive !== false && !['UNHEALTHY', 'DISABLED', 'BLOCKED'].includes(String(endpoint?.status || 'ACTIVE').toUpperCase());
  }
}
