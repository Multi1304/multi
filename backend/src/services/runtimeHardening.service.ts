import { config } from '../config';
import { FingerprintValidationService } from './fingerprintValidation.service';
import { ProfileOperationalService } from './profileOperational.service';

export interface RuntimeHardeningSnapshot {
  overallScore: number;
  status: 'strong' | 'warning' | 'critical';
  items: Array<{
    id: string;
    label: string;
    score: number;
    status: 'strong' | 'warning' | 'critical';
    detail: string;
  }>;
  fingerprint: ReturnType<typeof FingerprintValidationService.summarizeMatrix>;
  profiles: ReturnType<typeof ProfileOperationalService.summarize>;
  runtime: {
    strictMode: boolean;
    allowAutoHealingMutations: boolean;
    allowAggressiveClicks: boolean;
    humanPolicy: string;
    memoryAdmissionEnabled: boolean;
  };
  recommendations: string[];
}

export class RuntimeHardeningService {
  static buildSnapshot(presets: any[], profiles: any[]) : RuntimeHardeningSnapshot {
    const fingerprintMatrix = FingerprintValidationService.buildMatrix(presets, profiles);
    const fingerprintSummary = FingerprintValidationService.summarizeMatrix(fingerprintMatrix);
    const profileSummary = ProfileOperationalService.summarize(profiles);

    const strictScore = config.browserRuntime.strictMode ? 100 : 25;
    const mutationScore = !config.browserRuntime.allowAutoHealingMutations ? 95 : 45;
    const clickScore = !config.browserRuntime.allowAggressiveClicks ? 95 : 40;
    const humanPolicyScore =
      config.browserRuntime.humanPolicy === 'strict' ? 95 :
      config.browserRuntime.humanPolicy === 'balanced' ? 82 :
      60;
    const memoryScore = config.memoryAdmission.enabled ? 92 : 35;
    const fingerprintScore = fingerprintSummary.averageScore || 0;
    const profileScore = profileSummary.averageValidation || 0;

    const items: RuntimeHardeningSnapshot['items'] = [
      {
        id: 'strict_runtime',
        label: 'Strict Runtime',
        score: strictScore,
        status: this.statusFor(strictScore),
        detail: config.browserRuntime.strictMode
          ? 'Strict runtime is enabled.'
          : 'Runtime is not running in strict mode.',
      },
      {
        id: 'mutation_guardrails',
        label: 'Mutation Guardrails',
        score: Math.round((mutationScore + clickScore) / 2),
        status: this.statusFor(Math.round((mutationScore + clickScore) / 2)),
        detail: `Auto-healing mutations ${config.browserRuntime.allowAutoHealingMutations ? 'enabled' : 'disabled'}, aggressive clicks ${config.browserRuntime.allowAggressiveClicks ? 'enabled' : 'disabled'}.`,
      },
      {
        id: 'human_policy',
        label: 'Human Policy',
        score: humanPolicyScore,
        status: this.statusFor(humanPolicyScore),
        detail: `Current policy: ${config.browserRuntime.humanPolicy}.`,
      },
      {
        id: 'memory_admission',
        label: 'Memory Admission',
        score: memoryScore,
        status: this.statusFor(memoryScore),
        detail: config.memoryAdmission.enabled
          ? `Admission controller enabled (${config.memoryAdmission.maxRssMb}MB max RSS).`
          : 'Admission controller disabled.',
      },
      {
        id: 'fingerprint_validation',
        label: 'Fingerprint Validation',
        score: fingerprintScore,
        status: this.statusFor(fingerprintScore),
        detail: `${fingerprintSummary.critical} critical presets across ${fingerprintSummary.total} presets.`,
      },
      {
        id: 'profile_consistency',
        label: 'Profile Consistency',
        score: profileScore,
        status: this.statusFor(profileScore),
        detail: `${profileSummary.critical} critical profiles across ${profileSummary.total} profiles.`,
      },
    ];

    const overallScore = items.length
      ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length)
      : 0;

    const recommendations: string[] = [];
    if (!config.browserRuntime.strictMode) {
      recommendations.push('Enable strict runtime to reduce unstable automation behavior.');
    }
    if (config.browserRuntime.allowAggressiveClicks) {
      recommendations.push('Disable aggressive click policy in production-like environments.');
    }
    if (config.browserRuntime.allowAutoHealingMutations) {
      recommendations.push('Disable auto-healing mutations for enterprise-grade deterministic runs.');
    }
    if ((fingerprintSummary.critical || 0) > 0) {
      recommendations.push('Review weak fingerprint presets before promoting them to default usage.');
    }
    if ((profileSummary.critical || 0) > 0) {
      recommendations.push('Repair or rotate critical profiles with low validation scores.');
    }
    if (!config.memoryAdmission.enabled) {
      recommendations.push('Enable memory admission to avoid overcommitting machines under profile load.');
    }

    return {
      overallScore,
      status: this.statusFor(overallScore),
      items,
      fingerprint: fingerprintSummary,
      profiles: profileSummary,
      runtime: {
        strictMode: config.browserRuntime.strictMode,
        allowAutoHealingMutations: config.browserRuntime.allowAutoHealingMutations,
        allowAggressiveClicks: config.browserRuntime.allowAggressiveClicks,
        humanPolicy: config.browserRuntime.humanPolicy,
        memoryAdmissionEnabled: config.memoryAdmission.enabled,
      },
      recommendations,
    };
  }

  private static statusFor(score: number): 'strong' | 'warning' | 'critical' {
    if (score >= 85) return 'strong';
    if (score >= 65) return 'warning';
    return 'critical';
  }
}
