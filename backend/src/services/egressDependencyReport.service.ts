import { NetworkObservabilityService } from './networkObservability.service';
import { NetworkStrategyWizardService } from './networkStrategyWizard.service';
import { PoolSizingPlannerService } from './poolSizingPlanner.service';
import { ProxyAdvisorService } from './proxyAdvisor.service';
import { TenantCapacityService } from './tenantCapacity.service';

type DependenceLevel = 'none' | 'low' | 'medium' | 'high';

export class EgressDependencyReportService {
  static async getReport(tenantId: string) {
    const [capacity, proxyAdvisor, strategy, sizing, observability] = await Promise.all([
      TenantCapacityService.getStatus(tenantId),
      ProxyAdvisorService.getAdvisor(tenantId),
      NetworkStrategyWizardService.getPlan(tenantId),
      PoolSizingPlannerService.getPlan(tenantId),
      NetworkObservabilityService.getSnapshot(tenantId),
    ]);

    const seats = Math.max(1, capacity.activeSeatCount || 1);
    const concurrency = Math.max(
      1,
      capacity.effectiveConcurrentProfileLimit > 0 ? capacity.effectiveConcurrentProfileLimit : seats * 2,
    );
    const selfHostedHealthyExits = Number(observability.vpnCluster?.healthyExitCount || 0);
    const selfHostedTotalExits = Number(observability.vpnCluster?.exitCount || 0);

    const commercialHealthyEndpoints = (observability.pools || []).reduce((sum: number, pool: any) => {
      const provider = String(pool.provider || '').toUpperCase();
      const endpointTypes = (pool.endpointTypes || []).map((item: string) => String(item || '').toUpperCase());
      const isSelfHostedVpn = provider.includes('SELF_HOSTED') && endpointTypes.includes('VPN');
      return sum + (isSelfHostedVpn ? 0 : Number(pool.counts?.active || 0));
    }, 0);

    const proxylessProfiles = Math.max(0, concurrency - (sizing.targets?.targetConcurrentProxyProfiles || 0));
    const vpnManagedCapacity = Math.max(0, selfHostedHealthyExits * 2);
    const vpnProfiles = Math.min(
      Math.max(0, sizing.hybridPlan?.vpnSeats || 0),
      Math.max(0, sizing.targets?.targetConcurrentProxyProfiles || 0),
      vpnManagedCapacity,
    );
    const commercialProfiles = Math.max(
      0,
      Math.max(0, sizing.targets?.targetConcurrentProxyProfiles || 0) - vpnProfiles,
    );

    const proxylessPercent = this.toPercent(proxylessProfiles, concurrency);
    const selfHostedVpnPercent = this.toPercent(vpnProfiles, concurrency);
    const commercialPoolPercent = this.toPercent(commercialProfiles, concurrency);
    const strongSeparationCapacity = selfHostedHealthyExits + commercialHealthyEndpoints;
    const dependsOnCommercialPool = commercialProfiles > 0;
    const dependenceLevel = this.getDependenceLevel(commercialPoolPercent, commercialHealthyEndpoints);
    const weakestPoint =
      strongSeparationCapacity >= concurrency
        ? 'Current strong-separation capacity can cover the present concurrency target.'
        : `Strong separation starts to thin out above roughly ${strongSeparationCapacity} concurrent profiles with the current exits and pool health.`;

    return {
      seats,
      concurrency,
      scaleBand: strategy.scaleBand,
      dependsOnCommercialPool,
      commercialDependenceLevel: dependenceLevel,
      summary:
        dependsOnCommercialPool
          ? 'Camel can keep a large share of work on proxyless or self-hosted exits, but still needs a small commercial pool for overflow, geo gaps or stronger separation.'
          : 'Camel can currently cover the planned load with proxyless mode plus self-hosted exits, without needing commercial pool capacity.',
      currentCapacity: {
        proxyless: {
          recommendedProfiles: proxylessProfiles,
          percentOfConcurrency: proxylessPercent,
        },
        selfHostedVpn: {
          totalExits: selfHostedTotalExits,
          healthyExits: selfHostedHealthyExits,
          managedProfileCapacity: vpnManagedCapacity,
          recommendedProfiles: vpnProfiles,
          percentOfConcurrency: selfHostedVpnPercent,
        },
        commercialPool: {
          healthyEndpoints: commercialHealthyEndpoints,
          recommendedProfiles: commercialProfiles,
          percentOfConcurrency: commercialPoolPercent,
        },
      },
      strongSeparation: {
        currentCapacity: strongSeparationCapacity,
        breakpoint: strongSeparationCapacity,
        note: weakestPoint,
      },
      policy: {
        proxylessDefault: 'Use proxyless for builder, sandbox, QA, warmup and internal operation that does not need real network separation.',
        selfHostedVpn: 'Group self-hosted VPN exits by use case, keep metadata on each exit, and let Camel bind stable profile groups to those exits.',
        hybridDefault: 'Use hybrid as the default architecture: proxyless first, self-hosted exits second, commercial pool only for the traffic that truly needs it.',
        commercialOverflow: 'Reserve the commercial pool for overflow, geo-specific traffic and cases where your own exits do not provide enough healthy separation.',
        hygiene: 'Keep metadata, health checks, sticky routing and failover healthy so your own exits behave like a small managed pool.',
        growth: 'Grow the number of self-hosted exits before growing purchased proxies blindly.',
      },
      recommendations: this.buildRecommendations({
        proxyAdvisor,
        strategy,
        selfHostedHealthyExits,
        commercialHealthyEndpoints,
        commercialProfiles,
        strongSeparationCapacity,
        concurrency,
      }),
    };
  }

  private static buildRecommendations(input: {
    proxyAdvisor: any;
    strategy: any;
    selfHostedHealthyExits: number;
    commercialHealthyEndpoints: number;
    commercialProfiles: number;
    strongSeparationCapacity: number;
    concurrency: number;
  }) {
    const items = [
      'Keep builder, sandbox, QA, doctor AI, warmup and internal ops on proxyless mode by default.',
      input.selfHostedHealthyExits > 1
        ? `Treat the ${input.selfHostedHealthyExits} healthy self-hosted VPN exits as grouped egress lanes with sticky-per-profile routing.`
        : 'Add more than one healthy self-hosted VPN exit before expecting meaningful per-profile network separation from your own infrastructure.',
      'Keep hybrid as the main operating model so Camel only spends commercial egress where it adds real value.',
      input.commercialProfiles > 0
        ? `Reserve a small commercial pool for about ${input.commercialProfiles} concurrent profile(s), mainly overflow and geo-specific traffic.`
        : 'You can stay off commercial pool for the current planned load if your self-hosted exits remain healthy.',
      'Keep metadata, health checks, sticky routing and failover turned into routine hygiene instead of optional cleanup.',
      input.commercialHealthyEndpoints > 0
        ? 'Grow your self-hosted exits first, then keep the commercial pool small and clean instead of expanding it blindly.'
        : 'If you need stronger separation later, grow self-hosted exits first and add commercial coverage only where your own egress cannot cover geo or concurrency.',
    ];

    if (input.strongSeparationCapacity < input.concurrency) {
      items.push(
        `With current egress health, strong separation gets thin above about ${input.strongSeparationCapacity} concurrent profiles, so do not promise more than that without adding exits.`,
      );
    }

    if (input.strategy.scaleBand === 'high') {
      items.push('At high scale, plan self-hosted exits as a real egress fleet, not as one VPN shortcut.');
    }

    return items;
  }

  private static getDependenceLevel(percent: number, healthyEndpoints: number): DependenceLevel {
    if (percent <= 0 || healthyEndpoints <= 0) return 'none';
    if (percent <= 15) return 'low';
    if (percent <= 35) return 'medium';
    return 'high';
  }

  private static toPercent(value: number, total: number) {
    if (total <= 0) return 0;
    return Math.round((value / total) * 100);
  }
}
