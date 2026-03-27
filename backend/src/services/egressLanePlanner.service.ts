import { EgressDependencyReportService } from './egressDependencyReport.service';
import { NetworkObservabilityService } from './networkObservability.service';
import { NetworkStrategyWizardService } from './networkStrategyWizard.service';

export class EgressLanePlannerService {
  static async getPlan(tenantId: string) {
    const [report, observability, strategy] = await Promise.all([
      EgressDependencyReportService.getReport(tenantId),
      NetworkObservabilityService.getSnapshot(tenantId),
      NetworkStrategyWizardService.getPlan(tenantId),
    ]);

    const selfHostedClusters = (observability.vpnCluster?.clusters || []).map((cluster: any, index: number) => ({
      laneId: `self_hosted_vpn_${index + 1}`,
      clusterId: cluster.clusterId,
      label: `Self-Hosted VPN ${index + 1}`,
      type: 'self_hosted_vpn',
      exits: cluster.exits,
      healthyExits: cluster.healthy,
      countries: cluster.countries || [],
      cities: cluster.cities || [],
      targetProfiles: Math.max(0, cluster.healthy * 2),
      assignmentPolicy: 'sticky_per_profile',
      bestFor: [
        'Stable profile groups that need real but moderate separation',
        'Internal or allowlisted operations that should not stay proxyless',
        'Traffic you want on your own egress before touching paid pool capacity',
      ],
    }));

    const proxylessLane = {
      laneId: 'proxyless_default',
      label: 'Proxyless Default',
      type: 'proxyless',
      targetProfiles: report.currentCapacity.proxyless.recommendedProfiles,
      targetPercent: report.currentCapacity.proxyless.percentOfConcurrency,
      assignmentPolicy: 'local_default',
      bestFor: [
        'Builder, sandbox, QA, doctor AI and warmup',
        'Internal operation that does not need real per-profile network separation',
        'Lowest-cost default lane for most non-sensitive launches',
      ],
    };

    const commercialLane = {
      laneId: 'commercial_overflow',
      label: 'Commercial Overflow',
      type: 'commercial_pool',
      targetProfiles: report.currentCapacity.commercialPool.recommendedProfiles,
      targetPercent: report.currentCapacity.commercialPool.percentOfConcurrency,
      assignmentPolicy: 'geo_or_overflow_only',
      bestFor: [
        'Geo-specific traffic not covered by your own exits',
        'Overflow when self-hosted exits are exhausted or degraded',
        'Highest-separation launches that your own egress cannot cover safely',
      ],
    };

    const laneOrder = [
      proxylessLane.laneId,
      ...selfHostedClusters.map((item: any) => item.laneId),
      commercialLane.laneId,
    ];

    const minimizationScore = Math.max(
      0,
      100 - report.currentCapacity.commercialPool.percentOfConcurrency + Math.min(10, selfHostedClusters.length * 3),
    );

    return {
      summary:
        commercialLane.targetProfiles > 0
          ? 'Camel can keep most work on proxyless and self-hosted lanes, while reserving commercial pool only as overflow or geo-specific coverage.'
          : 'Camel can currently keep the planned load on proxyless and self-hosted lanes without needing commercial overflow.',
      defaultMode: 'hybrid',
      strategyScaleBand: strategy.scaleBand,
      minimizationScore,
      laneOrder,
      lanes: {
        proxyless: proxylessLane,
        selfHostedVpn: selfHostedClusters,
        commercialOverflow: commercialLane,
      },
      assignmentRules: [
        'Route builder, sandbox, QA, doctor AI, warmup and general internal operation to proxyless first.',
        'Bind stable profile groups to self-hosted VPN lanes with sticky-per-profile routing before considering commercial capacity.',
        'Use commercial overflow only for geo-specific traffic, degraded self-hosted coverage, or launches that exceed the strong-separation breakpoint.',
        'Grow self-hosted exits before expanding the commercial pool.',
      ],
      commercialMinimizationActions: [
        selfHostedClusters.length > 0
          ? `You already have ${selfHostedClusters.length} self-hosted VPN lane(s); keep them healthy and packed before spilling into paid pool capacity.`
          : 'Create at least two healthy self-hosted VPN exits so Camel can start reducing commercial dependence with real lane assignment.',
        report.currentCapacity.commercialPool.percentOfConcurrency > 20
          ? 'Commercial dependence is still material. Add self-hosted exits or reduce the number of profiles that truly need strong separation.'
          : 'Commercial dependence is already controlled. Keep the pool small and use it only where your own egress cannot cover the case.',
        'Keep metadata on each exit so Camel can steer traffic by country/city without paying for unnecessary pool breadth.',
      ],
      breakpointGuidance: report.strongSeparation.note,
    };
  }
}
