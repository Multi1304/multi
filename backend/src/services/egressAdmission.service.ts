import { EgressDependencyReportService } from './egressDependencyReport.service';
import { EgressLanePolicyService } from './egressLanePolicy.service';
import { NetworkObservabilityService } from './networkObservability.service';

export class EgressAdmissionService {
  static async evaluate(tenantId: string, profile: any) {
    const [report, observability, lane] = await Promise.all([
      EgressDependencyReportService.getReport(tenantId),
      NetworkObservabilityService.getSnapshot(tenantId),
      profile?.id ? EgressLanePolicyService.resolveLaneForProfile(tenantId, profile.id).catch(() => null) : Promise.resolve(null),
    ]);

    const normalizedPlatform = String(profile?.platform || '').toUpperCase();
    const geo = profile?.geolocation || {};
    const hasGeo = Boolean(geo?.country || geo?.countryCode || geo?.city);
    const sensitive =
      hasGeo ||
      ['MOBILE', 'TIKTOK', 'INSTAGRAM'].some((item) => normalizedPlatform.includes(item)) ||
      lane?.laneId === 'commercial_overflow';

    const selfHostedHealthyExits = Number(observability.vpnCluster?.healthyExitCount || 0);
    const commercialPercent = Number(report.currentCapacity?.commercialPool?.percentOfConcurrency || 0);

    const shouldQueue =
      sensitive &&
      (selfHostedHealthyExits < 2 || commercialPercent > 25) &&
      lane?.laneId === 'commercial_overflow';

    return {
      laneId: lane?.laneId || 'unassigned',
      sensitive,
      shouldQueue,
      reason: shouldQueue
        ? 'Camel prefers queue/review here instead of spilling sensitive traffic too early into commercial egress.'
        : 'Current egress posture is acceptable for this profile.',
      selfHostedHealthyExits,
      commercialPercent,
    };
  }
}
