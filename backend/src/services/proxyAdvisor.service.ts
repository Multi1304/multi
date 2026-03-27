import { prisma } from '../prisma';

type AdvisorSummary = {
  mode: 'proxyless' | 'limited_pool' | 'healthy_pool';
  summary: string;
  canOperateWithoutProxies: boolean;
  counts: {
    profiles: number;
    pools: number;
    endpoints: number;
    activeEndpoints: number;
    geoTaggedEndpoints: number;
  };
  guidance: {
    availableWithoutProxies: string[];
    degradedWithoutProxies: string[];
    recommendations: string[];
  };
  targetPool: {
    minimumHealthyEndpoints: number;
    suggestedStickyStrategy: 'STICKY_PER_PROFILE' | 'ROUND_ROBIN';
    suggestedTypes: string[];
  };
};

export class ProxyAdvisorService {
  static async getAdvisor(tenantId: string): Promise<AdvisorSummary> {
    const [pools, profiles] = await Promise.all([
      (prisma as any).proxyPool.findMany({
        where: { tenantId },
        include: { endpoints: true },
      }),
      typeof (prisma as any).profile?.count === 'function'
        ? (prisma as any).profile.count({ where: { tenantId } })
        : Promise.resolve(0),
    ]);

    const poolList = pools || [];
    const profileCount = Number(profiles || 0);
    const endpoints = poolList.flatMap((pool: any) => pool.endpoints || []);
    const activeEndpoints = endpoints.filter((endpoint: any) => {
      const status = String(endpoint.status || '').toUpperCase();
      return endpoint.isActive !== false && !['DISABLED', 'UNHEALTHY', 'BLOCKED'].includes(status);
    });
    const geoTaggedEndpoints = endpoints.filter((endpoint: any) => endpoint.country || endpoint.city).length;

    const counts = {
      profiles: profileCount,
      pools: poolList.length,
      endpoints: endpoints.length,
      activeEndpoints: activeEndpoints.length,
      geoTaggedEndpoints,
    };

    const availableWithoutProxies = [
      'Flow Builder, Automation, doctor AI, warmup, security, audit and dashboards keep working locally.',
      'Sandbox or allowlisted launches can still use profile state, persistence, timelines and smart launch.',
      'Fingerprint, reputation and warmup quality can still be improved before any external routing is added.',
    ];

    const degradedWithoutProxies = [
      'Network isolation between profiles becomes weak because the host IP stays shared.',
      'Geo targeting, sticky endpoint identity, failover and blend routing lose most of their practical value.',
      'Large multi-profile launches are harder to separate cleanly without a healthy proxy pool.',
    ];

    const recommendedHealthyEndpoints = Math.max(2, Math.min(12, Math.ceil(Math.max(profileCount, 1) / 3)));
    const healthyEnough = activeEndpoints.length >= recommendedHealthyEndpoints;
    const hasPool = poolList.length > 0;

    let mode: AdvisorSummary['mode'] = 'proxyless';
    let summary = 'Camel can operate in proxyless mode for local, sandbox and preparation workflows.';
    const recommendations: string[] = [];

    if (!hasPool) {
      recommendations.push('Stay proxyless for builder, sandbox and QA, but add a small pool before relying on network isolation.');
      recommendations.push(`A practical first step is ${recommendedHealthyEndpoints} healthy endpoints for ${Math.max(profileCount, 1)} profile(s).`);
      recommendations.push('Prefer a small clean pool with geo metadata over a large noisy pool.');
    } else if (!healthyEnough) {
      mode = 'limited_pool';
      summary = 'Camel has some proxy coverage, but the current pool is too thin for confident multi-profile routing.';
      recommendations.push(`Grow the pool to about ${recommendedHealthyEndpoints} healthy endpoints before treating routing as stable.`);
      recommendations.push('Run health checks and add country/city metadata so recommendations and failover are trustworthy.');
      recommendations.push('Use sticky-per-profile for profiles that should preserve a stable network identity.');
    } else {
      mode = 'healthy_pool';
      summary = 'Camel has enough healthy proxy coverage to benefit from sticky routing, geo targeting and pool recommendations.';
      recommendations.push('Keep health checks scheduled and remove degraded endpoints quickly to preserve routing quality.');
      recommendations.push('Separate residential/mobile/VPN pools by real use case instead of mixing everything into one pool.');
      recommendations.push('Use proxyless mode only for local QA and internal sandbox work.');
    }

    if (geoTaggedEndpoints === 0) {
      recommendations.push('Add country or city metadata to endpoints if you want meaningful geo targeting.');
    }

    return {
      mode,
      summary,
      canOperateWithoutProxies: true,
      counts,
      guidance: {
        availableWithoutProxies,
        degradedWithoutProxies,
        recommendations,
      },
      targetPool: {
        minimumHealthyEndpoints: recommendedHealthyEndpoints,
        suggestedStickyStrategy: profileCount > 1 ? 'STICKY_PER_PROFILE' : 'ROUND_ROBIN',
        suggestedTypes: profileCount > 3 ? ['RESIDENTIAL', 'MOBILE'] : ['DATACENTER', 'RESIDENTIAL'],
      },
    };
  }
}
