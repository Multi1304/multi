import { TenantCapacityService } from './tenantCapacity.service';
import { ProxyAdvisorService } from './proxyAdvisor.service';

type StrategyOption = {
  id: 'proxyless' | 'single_vpn' | 'multi_vpn_cluster' | 'hybrid' | 'proxy_pool';
  label: string;
  fit: 'good' | 'acceptable' | 'poor';
  summary: string;
  strengths: string[];
  limits: string[];
};

export class NetworkStrategyWizardService {
  static async getPlan(tenantId: string) {
    const [capacity, proxyAdvisor] = await Promise.all([
      TenantCapacityService.getStatus(tenantId),
      ProxyAdvisorService.getAdvisor(tenantId),
    ]);

    const seats = Math.max(1, capacity.activeSeatCount || 1);
    const concurrency = Math.max(1, capacity.effectiveConcurrentProfileLimit > 0 ? capacity.effectiveConcurrentProfileLimit : seats * 2);
    const scaleBand = seats >= 30 || concurrency >= 40 ? 'high' : seats >= 10 || concurrency >= 15 ? 'medium' : 'low';

    const options: StrategyOption[] = [
      {
        id: 'proxyless',
        label: 'Proxyless Local Mode',
        fit: scaleBand === 'low' ? 'good' : scaleBand === 'medium' ? 'acceptable' : 'poor',
        summary: 'Best for builder, QA, sandbox, warmup and internal operation where per-profile network separation is not the main goal.',
        strengths: [
          'Lowest cost and easiest setup.',
          'Good for local development, snapshots, security, doctor AI and dry runs.',
        ],
        limits: [
          'All profiles share the same public egress.',
          'Weak for geo targeting and multi-profile network isolation.',
        ],
      },
      {
        id: 'single_vpn',
        label: 'Single Self-Hosted VPN Exit',
        fit: scaleBand === 'low' ? 'acceptable' : 'poor',
        summary: 'Useful when you want a stable non-local exit for the whole workspace, but it still behaves like one shared network identity.',
        strengths: [
          'Simple first upgrade from proxyless mode.',
          'Good for office egress, predictable location and allowlisted internal tooling.',
        ],
        limits: [
          'Does not give real per-profile IP separation.',
          '20-50 seats over one VPN exit still correlate heavily at network level.',
        ],
      },
      {
        id: 'multi_vpn_cluster',
        label: 'Multi-Exit Self-Hosted VPN Cluster',
        fit: scaleBand === 'low' ? 'acceptable' : 'good',
        summary: 'A practical way to reduce dependence on commercial pools: several self-hosted exits with metadata, sticky routing and failover, treated as real distinct endpoints.',
        strengths: [
          'Much stronger than one VPN gateway because Camel can bind profiles to different exits.',
          'Good for hybrid architectures where you want your own infrastructure first.',
        ],
        limits: [
          'Still needs multiple real exits. It is not free identity multiplication from one IP.',
          'Needs the same hygiene as any pool: health checks, metadata and capacity planning.',
        ],
      },
      {
        id: 'hybrid',
        label: 'Hybrid: Proxyless + Self-Hosted VPN + Small Pool',
        fit: scaleBand === 'high' ? 'acceptable' : 'good',
        summary: 'Best practical middle ground: keep local/sandbox work direct or on VPN, and reserve the pool for profiles that truly need isolated routing.',
        strengths: [
          'Controls cost while preserving network separation where it matters.',
          'Lets Camel keep using smart launch, warmup and doctor AI on profiles that do not need dedicated egress.',
        ],
        limits: [
          'Needs clear policy about which profiles get pool-backed launches.',
          'Still weaker than a broad healthy pool if every seat needs independent routing.',
        ],
      },
      {
        id: 'proxy_pool',
        label: 'Healthy Proxy Pool',
        fit: scaleBand === 'high' ? 'good' : 'acceptable',
        summary: 'Best when you truly need per-profile network identity, geo specificity and reliable sticky/failover behavior.',
        strengths: [
          'Unlocks the full routing, failover and sticky identity layer in Camel.',
          'Scales much better when many seats run profiles concurrently.',
        ],
        limits: [
          'More cost and more operational hygiene required.',
          'A bad pool is worse than a small clean one.',
        ],
      },
    ];

    const recommendation =
      scaleBand === 'low'
        ? 'Start with proxyless or one self-hosted VPN, then add a small pool only for profiles that need true separation.'
        : scaleBand === 'medium'
          ? 'Hybrid is usually the best cost-to-control tradeoff. Keep local and sandbox work off-pool, and reserve clean endpoints for important profiles.'
          : 'At this scale, rely on a healthy pool or at least a hybrid model with enough clean endpoints. A single IP or single VPN exit is not enough for 20-50 seats if you need real separation.';

    return {
      scaleBand,
      seats,
      concurrency,
      proxyAdvisor,
      recommendation,
      options,
      vpnGuidance: {
        attractive: true,
        summary: 'A self-hosted VPN is attractive as a stable workspace egress. One node is useful, but several exits are much more practical because Camel can treat them as a small self-hosted pool.',
        bestUseCases: [
          'Office or team egress with one predictable location.',
          'Internal tools, allowlisted hosts and controlled QA exits.',
          'Hybrid setups where the VPN cluster carries low-risk or medium-separation traffic and the pool carries the highest-separation traffic.',
        ],
      },
    };
  }
}
