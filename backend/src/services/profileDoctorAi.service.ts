import { XaiService } from './xai.service';
import { ProfileDoctorService } from './profileDoctor.service';
import { ProfileTimelineService } from './profileTimeline.service';
import { ProfileQuarantineService } from './profileQuarantine.service';
import { ProfileReputationService } from './profileReputation.service';

export class ProfileDoctorAiService {
  static async diagnose(profileId: string, tenantId: string) {
    const [doctor, timeline, quarantine, reputation] = await Promise.all([
      ProfileDoctorService.evaluate(profileId, tenantId),
      ProfileTimelineService.getTimeline(profileId, tenantId),
      ProfileQuarantineService.get(profileId),
      ProfileReputationService.scoreProfile(profileId, tenantId).catch(() => null),
    ]);
    const severity = deriveSeverity(doctor.healthScore, doctor.status, quarantine?.active === true);
    const confidence = deriveConfidence(doctor, timeline.items.length, reputation?.reputationScore ?? null);
    const launchRecommendation = deriveLaunchRecommendation(doctor.healthScore, quarantine?.active === true, doctor.overlap.sharedFingerprintCount);
    const safeAutofixPlan = buildSafeAutofixPlan(doctor, quarantine?.active === true);
    const warmupRecommendation = deriveWarmupRecommendation(doctor.healthScore, reputation?.reputationScore ?? null, timeline.items[0]?.at || null);
    const signals = buildSignals(doctor, quarantine?.active === true, timeline.items);
    const warmupLearning = reputation?.warmupLearning || null;

    const compact = {
      doctor: {
        healthScore: doctor.healthScore,
        status: doctor.status,
        overlap: doctor.overlap,
        recommendations: doctor.recommendations,
      },
      reputation: reputation ? {
        score: reputation.reputationScore,
        tier: reputation.tier,
        ageDays: reputation.ageDays,
        warmupLearning,
      } : null,
      timeline: timeline.items.slice(0, 8).map((item) => ({
        at: item.at,
        title: item.title,
        severity: item.severity,
      })),
      quarantine: quarantine ? { active: quarantine.active, reason: quarantine.reason } : null,
      derived: {
        severity,
        confidence,
        launchRecommendation,
        warmupRecommendation,
        safeAutofixPlan,
        signals,
        warmupLearning,
      },
    };

    try {
      const raw = await XaiService.chat(
        `Analyze this internal Camel profile health snapshot and return JSON with keys summary, rootCause, nextActions, safeAutofix, severity, confidence, launchRecommendation, warmupRecommendation, signals. Data: ${JSON.stringify(compact)}`,
        'You are Camel internal profile doctor AI. You only analyze internal health, consistency, sync, and operator safety. Never advise bypassing third-party defenses. Keep recommendations internal-only and return JSON only.',
        { tenantId, taskType: 'doctor' }
      );
      return {
        source: 'ai',
        severity,
        confidence,
        launchRecommendation,
        warmupRecommendation,
        safeAutofixPlan,
        signals,
        warmupLearning,
        ...(JSON.parse(raw) as Record<string, any>),
      };
    } catch {
      return {
        source: 'heuristic',
        severity,
        confidence,
        summary: doctor.recommendations[0],
        rootCause: doctor.overlap.sharedFingerprintCount > 0
          ? 'Internal clone overlap is increasing correlation risk.'
          : quarantine?.active
            ? 'This profile is currently isolated because an operator or safeguard flagged it for manual review.'
          : warmupLearning?.lastOutcome === 'worsened'
            ? 'Recent warmup feedback shows the previous stabilization plan did not improve readiness.'
          : doctor.status !== 'healthy'
            ? 'Profile health is below ideal because consistency or sync state drifted.'
            : 'No major issue detected.',
        nextActions: [
          ...doctor.recommendations,
          warmupLearning?.completed
            ? `Warmup memory says the last useful mode was ${warmupLearning.lastMode || warmupLearning.recommendedMode} with outcome ${warmupLearning.lastOutcome}.`
            : null,
        ].filter(Boolean),
        safeAutofix: safeAutofixPlan.primaryAction,
        safeAutofixPlan,
        launchRecommendation,
        warmupRecommendation,
        signals,
        warmupLearning,
      };
    }
  }
}

function deriveSeverity(score: number, status: string, quarantined: boolean) {
  if (quarantined) return 'critical';
  if (status === 'needs_attention' || score < 55) return 'high';
  if (status === 'watch' || score < 75) return 'medium';
  return 'low';
}

function deriveConfidence(doctor: any, timelineCount: number, reputationScore: number | null) {
  let confidence = 0.62;
  if (timelineCount >= 6) confidence += 0.12;
  if (doctor.overlap.sharedFingerprintCount > 0 || doctor.overlap.sharedProxyCount > 0) confidence += 0.08;
  if (typeof reputationScore === 'number') confidence += 0.08;
  if (doctor.status === 'healthy') confidence -= 0.04;
  return Math.max(0.35, Math.min(0.96, Number(confidence.toFixed(2))));
}

function deriveLaunchRecommendation(score: number, quarantined: boolean, overlapCount: number) {
  if (quarantined) return 'blocked';
  if (score < 55) return 'hold';
  if (overlapCount > 0 || score < 75) return 'warmup_first';
  return 'launch_ready';
}

function deriveWarmupRecommendation(score: number, reputationScore: number | null, lastEventAt: string | null) {
  const idleHours = lastEventAt ? Math.floor((Date.now() - new Date(lastEventAt).getTime()) / (60 * 60 * 1000)) : 999;
  if (score < 55 || idleHours > 120) return 'overnight';
  if ((reputationScore ?? 0) < 60 || idleHours > 48) return 'moderate';
  if (idleHours > 12) return 'light';
  return 'none';
}

function buildSafeAutofixPlan(doctor: any, quarantined: boolean) {
  if (quarantined) {
    return {
      primaryAction: 'quarantine_review',
      secondaryAction: 'manual_release_check',
      rationale: ['Profile is intentionally isolated and should not auto-heal itself out of quarantine.'],
    };
  }

  if (doctor.overlap.sharedFingerprintCount > 0 || doctor.overlap.sharedProxyCount > 0) {
    return {
      primaryAction: 'decouple_plan',
      secondaryAction: 'warmup_moderate',
      rationale: [
        'Sibling overlap is the strongest internal correlation signal.',
        'Decoupling before the next heavy launch is safer than retrying with the current baseline.',
      ],
    };
  }

  if (doctor.status === 'needs_attention') {
    return {
      primaryAction: 'warmup_overnight',
      secondaryAction: 'consistency_hold',
      rationale: [
        'Profile health is below the safe launch threshold.',
        'A staged warmup and a stable routing window reduce further drift.',
      ],
    };
  }

  return {
    primaryAction: 'none',
    secondaryAction: 'monitor',
    rationale: ['No safe automatic intervention is required right now.'],
  };
}

function buildSignals(doctor: any, quarantined: boolean, timelineItems: Array<{ severity?: string; title?: string }>) {
  const recentWarnings = timelineItems.filter((item) => item.severity === 'warning' || item.severity === 'critical').length;
  return [
    { code: 'quarantine_active', active: quarantined, weight: quarantined ? 100 : 0 },
    { code: 'fingerprint_overlap', active: doctor.overlap.sharedFingerprintCount > 0, weight: doctor.overlap.sharedFingerprintCount * 18 },
    { code: 'proxy_overlap', active: doctor.overlap.sharedProxyCount > 0, weight: doctor.overlap.sharedProxyCount * 10 },
    { code: 'consistency_drift', active: doctor.consistency?.status === 'drifted', weight: doctor.consistency?.status === 'drifted' ? 16 : 0 },
    { code: 'recent_warning_activity', active: recentWarnings > 0, weight: recentWarnings * 6 },
  ];
}
