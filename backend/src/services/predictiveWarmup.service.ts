import { prisma } from '../prisma';
import { ProfileDoctorService } from './profileDoctor.service';
import { ProfileReputationService } from './profileReputation.service';
import { ProfileTimelineService } from './profileTimeline.service';

export class PredictiveWarmupService {
  static async planForProfile(profileId: string, tenantId: string) {
    const [doctor, reputation, timeline, profile] = await Promise.all([
      ProfileDoctorService.evaluate(profileId, tenantId),
      ProfileReputationService.scoreProfile(profileId, tenantId),
      ProfileTimelineService.getTimeline(profileId, tenantId),
      (prisma.profile as any).findUnique({
        where: { id: profileId },
        select: { id: true, name: true, platform: true, createdAt: true },
      }).catch(() => null),
    ]);

    const idleHours = timeline.items[0]?.at
      ? Math.floor((Date.now() - new Date(timeline.items[0].at).getTime()) / (60 * 60 * 1000))
      : 999;

    let mode: 'none' | 'light' | 'moderate' | 'overnight' = 'light';
    if (reputation.reputationScore >= 88 && idleHours < 24) mode = 'none';
    else if (doctor.healthScore >= 75 && idleHours < 72) mode = 'light';
    else if (doctor.healthScore >= 60) mode = 'moderate';
    else mode = 'overnight';

    const steps = buildWarmupSteps(mode, doctor, idleHours);
    const estimatedDurationMinutes = estimateWarmupDuration(mode, idleHours);
    const autoQueueEligible = mode === 'overnight' || (mode === 'moderate' && reputation.reputationScore < 65);
    const riskBand = mode === 'overnight' ? 'high' : mode === 'moderate' ? 'medium' : mode === 'light' ? 'low' : 'minimal';
    const readinessAfterWarmup = projectReadiness(doctor.healthScore, mode, reputation.reputationScore);

    return {
      profileId,
      profileName: profile?.name || profileId,
      platform: profile?.platform || 'unknown',
      mode,
      riskBand,
      idleHours,
      autoQueueEligible,
      estimatedDurationMinutes,
      readinessAfterWarmup,
      nextWindow: mode === 'overnight' ? '02:00-05:00 local time' : mode === 'moderate' ? 'next low-traffic hour' : 'before next major launch',
      reasons: [
        doctor.recommendations[0],
        idleHours >= 72 ? 'Profile has been idle long enough that a staged warmup is safer than a cold heavy launch.' : 'Recent activity exists, so only a lighter warmup is needed.',
      ].filter(Boolean),
      reputation,
      doctorStatus: doctor.status,
      steps,
      blockers: buildBlockers(doctor, mode),
    };
  }

  static async listNightlyCandidates(tenantId: string) {
    const profiles = await (prisma.profile as any).findMany({
      where: { tenantId },
      select: { id: true, name: true },
      take: 40,
    }).catch(() => []);

    const plans = await Promise.all(
      profiles.map((profile: any) => this.planForProfile(profile.id, tenantId).catch(() => null))
    );

    const candidates = plans.filter(Boolean).filter((item: any) => item.mode === 'moderate' || item.mode === 'overnight');
    return candidates.slice().sort((a: any, b: any) => {
      const priority = { overnight: 3, moderate: 2, light: 1, none: 0 } as Record<string, number>;
      const priorityDelta = (priority[b.mode] || 0) - (priority[a.mode] || 0);
      if (priorityDelta !== 0) return priorityDelta;
      return (b.idleHours || 0) - (a.idleHours || 0);
    }).slice(0, 12);
  }
}

function buildWarmupSteps(mode: 'none' | 'light' | 'moderate' | 'overnight', doctor: any, idleHours: number) {
  const steps = [];
  if (mode === 'none') {
    steps.push({ order: 1, kind: 'launch_ready_check', label: 'Profile can launch with only a quick preflight check.', durationMinutes: 3 });
    return steps;
  }

  steps.push({ order: 1, kind: 'routing_stabilize', label: 'Keep the same healthy route and sticky endpoint through the warmup window.', durationMinutes: 10 });

  if (doctor.overlap.sharedFingerprintCount > 0 || doctor.overlap.sharedProxyCount > 0) {
    steps.push({ order: 2, kind: 'decouple_review', label: 'Review the decouple assistant before any large run.', durationMinutes: 10 });
  }

  steps.push({
    order: steps.length + 1,
    kind: 'low_intensity_session',
    label: mode === 'light' ? 'Run a short low-intensity session.' : 'Run staged low-intensity sessions with pauses.',
    durationMinutes: mode === 'light' ? 12 : mode === 'moderate' ? 25 : 45,
  });

  if (mode === 'moderate' || mode === 'overnight') {
    steps.push({
      order: steps.length + 1,
      kind: 'session_persistence_check',
      label: 'Confirm session persistence and storage state after the first stage.',
      durationMinutes: 8,
    });
  }

  if (mode === 'overnight' || idleHours > 96) {
    steps.push({
      order: steps.length + 1,
      kind: 'overnight_idle_window',
      label: 'Let the profile cool down in a stable overnight window before the next major launch.',
      durationMinutes: 120,
    });
  }

  return steps;
}

function estimateWarmupDuration(mode: 'none' | 'light' | 'moderate' | 'overnight', idleHours: number) {
  if (mode === 'none') return 3;
  if (mode === 'light') return 20;
  if (mode === 'moderate') return idleHours > 96 ? 55 : 40;
  return idleHours > 168 ? 180 : 135;
}

function buildBlockers(doctor: any, mode: 'none' | 'light' | 'moderate' | 'overnight') {
  const blockers = [];
  if (doctor.consistency?.status === 'drifted') {
    blockers.push('Consistency has drifted; avoid changing route or fingerprint again until the warmup completes.');
  }
  if (doctor.overlap.sharedFingerprintCount > 0 && mode !== 'none') {
    blockers.push('Internal fingerprint overlap should be reviewed before launching high-value flows.');
  }
  if (doctor.overlap.sharedProxyCount > 0 && mode === 'overnight') {
    blockers.push('Proxy overlap remains present; schedule a decouple review before the next heavy session.');
  }
  return blockers;
}

function projectReadiness(score: number, mode: 'none' | 'light' | 'moderate' | 'overnight', reputationScore: number) {
  const delta = mode === 'none' ? 0 : mode === 'light' ? 4 : mode === 'moderate' ? 9 : 14;
  return Math.max(0, Math.min(100, score + delta + (reputationScore >= 80 ? 2 : 0)));
}
