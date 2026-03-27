import { prisma } from '../prisma';
import { EgressLanePlannerService } from './egressLanePlanner.service';

type LaneRule = {
  laneId: string;
  label: string;
  profileIds: string[];
  rationale: string;
  targetClusterId?: string;
};

type EffectivePolicy = {
  source: 'saved' | 'recommended';
  generatedAt: string;
  rules: LaneRule[];
};

export class EgressLanePolicyService {
  static async getEffectivePolicy(tenantId: string): Promise<EffectivePolicy> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const saved = (tenant?.settings as any)?.egressLanePolicy;
    if (saved?.enabled && Array.isArray(saved.rules)) {
      return {
        source: 'saved',
        generatedAt: saved.generatedAt || new Date().toISOString(),
        rules: saved.rules,
      };
    }
    return this.buildRecommendedPolicy(tenantId);
  }

  static async buildRecommendedPolicy(tenantId: string): Promise<EffectivePolicy> {
    const [planner, profiles] = await Promise.all([
      EgressLanePlannerService.getPlan(tenantId),
      (prisma.profile as any).findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          platform: true,
          geolocation: true,
          proxyPoolId: true,
        },
        orderBy: [{ createdAt: 'asc' }],
      }),
    ]);

    const proxylessRules: string[] = [];
    const commercialRules: string[] = [];
    const selfHostedAssignments = new Map<string, string[]>();
    for (const lane of planner.lanes?.selfHostedVpn || []) {
      selfHostedAssignments.set(lane.laneId, []);
    }

    const selfHostedLanes = planner.lanes?.selfHostedVpn || [];
    const selfHostedCapacities = new Map<string, number>();
    for (const lane of selfHostedLanes) {
      selfHostedCapacities.set(lane.laneId, Number(lane.targetProfiles || 0));
    }

    const internalRegex = /(sandbox|qa|internal|warmup|doctor|builder|test)/i;
    let selfHostedIndex = 0;

    for (const profile of profiles) {
      if (profile.proxyPoolId) {
        commercialRules.push(profile.id);
        continue;
      }

      const needsInternalLane = internalRegex.test(String(profile.name || ''));
      if (needsInternalLane) {
        proxylessRules.push(profile.id);
        continue;
      }

      const normalizedPlatform = String(profile.platform || '').toUpperCase();
      const geo = profile.geolocation as any;
      const hasGeo = Boolean(geo?.country || geo?.countryCode || geo?.city);
      const wantsSeparatedLane = hasGeo || ['MOBILE', 'TIKTOK', 'INSTAGRAM'].some((item) => normalizedPlatform.includes(item));

      if (wantsSeparatedLane && selfHostedLanes.length) {
        const chosen = this.pickNextSelfHostedLane(selfHostedLanes, selfHostedCapacities, selfHostedIndex);
        if (chosen) {
          selfHostedAssignments.get(chosen.laneId)?.push(profile.id);
          selfHostedCapacities.set(chosen.laneId, Math.max(0, (selfHostedCapacities.get(chosen.laneId) || 0) - 1));
          selfHostedIndex += 1;
          continue;
        }
      }

      if (planner.lanes?.commercialOverflow?.targetProfiles > 0) {
        commercialRules.push(profile.id);
      } else {
        proxylessRules.push(profile.id);
      }
    }

    const rules: LaneRule[] = [];
    if (proxylessRules.length) {
      rules.push({
        laneId: 'proxyless_default',
        label: 'Proxyless Default',
        profileIds: proxylessRules,
        rationale: 'Internal, QA, sandbox and low-separation profiles stay on proxyless mode first.',
      });
    }

    for (const lane of selfHostedLanes) {
      const assigned = selfHostedAssignments.get(lane.laneId) || [];
      if (!assigned.length) continue;
      rules.push({
        laneId: lane.laneId,
        label: lane.label,
        profileIds: assigned,
        rationale: 'Stable profile groups are pinned to healthy self-hosted exits before using paid pool capacity.',
        targetClusterId: lane.clusterId,
      });
    }

    if (commercialRules.length) {
      rules.push({
        laneId: 'commercial_overflow',
        label: 'Commercial Overflow',
        profileIds: commercialRules,
        rationale: 'Only the profiles that still need stronger or geo-specific separation spill into commercial pool capacity.',
      });
    }

    return {
      source: 'recommended',
      generatedAt: new Date().toISOString(),
      rules,
    };
  }

  static async resolveLaneForProfile(tenantId: string, profileId: string) {
    const policy = await this.getEffectivePolicy(tenantId);
    return policy.rules.find((rule) => rule.profileIds.includes(profileId)) || null;
  }

  private static pickNextSelfHostedLane(lanes: any[], capacities: Map<string, number>, indexSeed: number) {
    if (!lanes.length) return null;
    for (let offset = 0; offset < lanes.length; offset += 1) {
      const lane = lanes[(indexSeed + offset) % lanes.length];
      if ((capacities.get(lane.laneId) || 0) > 0) {
        return lane;
      }
    }
    return null;
  }
}
