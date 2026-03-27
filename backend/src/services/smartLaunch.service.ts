import { NetworkRoutingService } from './networkRouting.service';
import { BrowserNodeService } from './browser.node';
import { ProfileDoctorService } from './profileDoctor.service';
import { NotificationCenterService } from './notificationCenter.service';
import { ProfileStateService } from './profileState.service';
import { WarmupLearningService } from './warmupLearning.service';
import { EgressAdmissionService } from './egressAdmission.service';
import { prisma } from '../prisma';

export class SmartLaunchService {
  static async plan(profileId: string, tenantId: string) {
    const profile = await (prisma.profile as any).findUnique({
      where: { id: profileId },
      include: { proxyPool: true, networkPolicy: true },
    });
    if (!profile) throw new Error(`Profile ${profileId} not found`);

    const [doctor, state, routing, warmupLearning, egressAdmission] = await Promise.all([
      ProfileDoctorService.evaluate(profileId, tenantId),
      ProfileStateService.getStateSummary(profileId, tenantId),
      NetworkRoutingService.resolve({
        tenantId,
        profileId,
        profile,
        sticky: true,
        country: profile?.geolocation?.country || profile?.geolocation?.countryCode || null,
        city: profile?.geolocation?.city || null,
        platform: profile.platform || null,
        allowVpn: true,
      }),
      WarmupLearningService.summarizeProfile(tenantId, profileId).catch(() => null),
      EgressAdmissionService.evaluate(tenantId, profile),
    ]);

    const cookieCount = state.sessionSnapshot?.sessionPersistence?.cookies?.count || 0;
    let warmupMode =
      doctor.healthScore >= 85 && cookieCount > 10
        ? 'skip'
        : doctor.healthScore >= 70
          ? 'light'
          : 'stabilize';

    if (warmupLearning?.lastOutcome === 'worsened' || (warmupLearning?.averageDelta || 0) < 0) {
      warmupMode = warmupMode === 'skip' ? 'light' : 'stabilize';
    } else if (warmupLearning?.improved && (warmupLearning.averageDelta || 0) >= 5 && cookieCount > 10) {
      warmupMode = warmupMode === 'stabilize' ? 'light' : warmupMode;
    }

    const launchReadiness =
      warmupMode === 'stabilize'
        ? 'review'
        : doctor.healthScore >= 65 && (warmupLearning?.lastOutcome !== 'worsened')
          ? 'ready'
          : 'review';

    return {
      profileId,
      profileName: profile.name,
      warmupMode,
      launchReadiness,
      proxyEndpointId: routing.endpoint?.id || null,
      routing: routing.selection,
      egressAdmission,
      warmupLearning,
      notes: [
        doctor.recommendations[0],
        egressAdmission?.shouldQueue
          ? egressAdmission.reason
          : null,
        warmupLearning?.completed
          ? `Warmup learning suggests ${warmupLearning.recommendedMode} follow-ups with last outcome ${warmupLearning.lastOutcome}.`
          : null,
        warmupLearning?.completed
          ? `Reuse the last effective pattern: ${warmupLearning.lastMode || warmupLearning.recommendedMode}.`
          : null,
        warmupMode === 'skip'
          ? 'Profile can be launched directly with the current sticky context.'
          : warmupMode === 'light'
            ? 'Apply a short human-mode warmup before heavy work.'
            : 'Stabilize the profile before heavy launch activity.',
      ].filter(Boolean),
      doctor,
    };
  }

  static async launch(profileId: string, tenantId: string) {
    const plan = await this.plan(profileId, tenantId);
    if (plan.egressAdmission?.shouldQueue) {
      throw new Error(plan.egressAdmission.reason);
    }
    const profile = await (prisma.profile as any).findUnique({ where: { id: profileId } });
    if (!profile) throw new Error(`Profile ${profileId} not found`);
    const routing = await NetworkRoutingService.resolve({
      tenantId,
      profileId,
      profile,
      sticky: true,
      country: profile?.geolocation?.country || profile?.geolocation?.countryCode || null,
      city: profile?.geolocation?.city || null,
      platform: profile.platform || null,
      allowVpn: true,
    });
    const page = await BrowserNodeService.createPage(profileId, profile.fingerprint, routing.proxy || profile.proxyConfig);
    await page.goto('about:blank');

    await Promise.resolve(NotificationCenterService.push(tenantId, {
      kind: 'launch',
      title: `Smart launch prepared ${plan.profileName}`,
      body: plan.notes[0] || 'Profile launched with the current smart routing decision.',
      severity: plan.launchReadiness === 'ready' ? 'info' : 'warning',
    })).catch(() => undefined);

    return plan;
  }
}
