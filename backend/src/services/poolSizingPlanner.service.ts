import { TenantCapacityService } from './tenantCapacity.service';
import { NetworkStrategyWizardService } from './networkStrategyWizard.service';

export class PoolSizingPlannerService {
  static async getPlan(tenantId: string) {
    const [capacity, strategy] = await Promise.all([
      TenantCapacityService.getStatus(tenantId),
      NetworkStrategyWizardService.getPlan(tenantId),
    ]);

    const seats = Math.max(1, capacity.activeSeatCount || 1);
    const concurrency = Math.max(1, capacity.effectiveConcurrentProfileLimit > 0 ? capacity.effectiveConcurrentProfileLimit : seats * 2);
    const proxyBackedSeats =
      strategy.scaleBand === 'low'
        ? Math.max(1, Math.ceil(seats * 0.25))
        : strategy.scaleBand === 'medium'
          ? Math.max(2, Math.ceil(seats * 0.4))
          : Math.max(4, Math.ceil(seats * 0.6));

    const targetConcurrentProxyProfiles =
      strategy.scaleBand === 'low'
        ? Math.max(1, Math.ceil(concurrency * 0.3))
        : strategy.scaleBand === 'medium'
          ? Math.max(2, Math.ceil(concurrency * 0.45))
          : Math.max(4, Math.ceil(concurrency * 0.65));

    const recommendedHealthyEndpoints = Math.max(
      strategy.proxyAdvisor?.targetPool?.minimumHealthyEndpoints || 0,
      Math.ceil(targetConcurrentProxyProfiles / 2),
    );

    const hybridPlan = {
      proxylessSeats: Math.max(0, seats - proxyBackedSeats),
      vpnSeats: strategy.scaleBand === 'high' ? Math.max(2, Math.ceil(seats * 0.2)) : Math.max(1, Math.ceil(seats * 0.15)),
      proxyBackedSeats,
    };

    return {
      seats,
      concurrency,
      scaleBand: strategy.scaleBand,
      recommendation: strategy.recommendation,
      suggestedArchitecture:
        strategy.scaleBand === 'low'
          ? 'proxyless_or_single_vpn'
          : strategy.scaleBand === 'medium'
            ? 'hybrid'
            : 'hybrid_or_pool_first',
      targets: {
        targetConcurrentProxyProfiles,
        recommendedHealthyEndpoints,
        reserveEndpoints: Math.max(1, Math.ceil(recommendedHealthyEndpoints * 0.2)),
        stickyStrategy: strategy.proxyAdvisor?.targetPool?.suggestedStickyStrategy || 'STICKY_PER_PROFILE',
      },
      hybridPlan,
      notes: [
        'A single public IP or a single VPN exit does not create real per-profile network separation for many seats.',
        'Hybrid usually gives the best cost/control tradeoff: keep local and sandbox work off-pool, reserve healthy endpoints for the profiles that truly need isolated routing.',
        'Prefer few clean endpoints with geo metadata over many low-quality endpoints.',
      ],
    };
  }
}
