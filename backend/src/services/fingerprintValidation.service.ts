import { AiFingerprintService } from './aiFingerprint.service';
import { FingerprintHardeningService } from './fingerprintHardening.service';

export interface FingerprintMatrixRow {
  id: string;
  name: string;
  platform: string;
  browser: string;
  presetVersion: string;
  validationScore: number;
  hardeningScore: number;
  adjustmentCount: number;
  issueCount: number;
  severity: 'healthy' | 'warning' | 'critical';
  issues: string[];
  blockingIssues: string[];
  releaseReadiness: 'ready' | 'review' | 'hold';
  recommendation: string;
  profileCount: number;
}

export class FingerprintValidationService {
  static buildMatrix(presets: any[], profiles: any[] = []): FingerprintMatrixRow[] {
    const profileCounts = new Map<string, number>();
    for (const profile of profiles) {
      if (!profile?.fingerprintPresetId) continue;
      profileCounts.set(
        profile.fingerprintPresetId,
        (profileCounts.get(profile.fingerprintPresetId) || 0) + 1
      );
    }

    return presets.map((preset: any) => {
      const hardened = FingerprintHardeningService.harden(preset?.config || {});
      const config = hardened.fingerprint || {};
      const validation = config.validation || AiFingerprintService.validateFingerprintConsistency(config);
      const score = Number(validation?.score || 0);
      const issueCount = Array.isArray(validation?.issues) ? validation.issues.length : 0;
      const blockingIssues = Array.isArray(hardened.blockingIssues) ? hardened.blockingIssues : [];
      const releaseReadiness = hardened.riskLevel || 'review';
      const severity: FingerprintMatrixRow['severity'] =
        score >= 85 && blockingIssues.length === 0 ? 'healthy' : score >= 65 && blockingIssues.length === 0 ? 'warning' : 'critical';
      const recommendation =
        releaseReadiness === 'ready'
          ? 'Candidate for recommendation or wider rollout.'
          : releaseReadiness === 'review'
            ? 'Keep active but review the highlighted adjustments before promotion.'
            : 'Hold promotion until blocking issues are cleared.';

      return {
        id: preset.id,
        name: preset.name,
        platform: preset.platform || 'OTHER',
        browser: preset.browser || 'CHROME',
        presetVersion: config.presetVersion || 'legacy',
        validationScore: score,
        hardeningScore: hardened.score,
        adjustmentCount: hardened.adjustments.length,
        issueCount,
        severity,
        issues: validation?.issues || [],
        blockingIssues,
        releaseReadiness,
        recommendation,
        profileCount: profileCounts.get(preset.id) || 0,
      };
    }).sort((a, b) => {
      if (a.validationScore !== b.validationScore) return a.validationScore - b.validationScore;
      return b.profileCount - a.profileCount;
    });
  }

  static summarizeMatrix(matrix: FingerprintMatrixRow[]) {
    const healthy = matrix.filter((row) => row.severity === 'healthy').length;
    const warning = matrix.filter((row) => row.severity === 'warning').length;
    const critical = matrix.filter((row) => row.severity === 'critical').length;
    const averageScore = matrix.length
      ? Math.round(matrix.reduce((sum, row) => sum + row.validationScore, 0) / matrix.length)
      : 0;
    const averageHardeningScore = matrix.length
      ? Math.round(matrix.reduce((sum, row) => sum + row.hardeningScore, 0) / matrix.length)
      : 0;
    const ready = matrix.filter((row) => row.releaseReadiness === 'ready').length;
    const review = matrix.filter((row) => row.releaseReadiness === 'review').length;
    const hold = matrix.filter((row) => row.releaseReadiness === 'hold').length;

    return {
      total: matrix.length,
      averageScore,
      averageHardeningScore,
      healthy,
      warning,
      critical,
      ready,
      review,
      hold,
      weakest: matrix.slice(0, 5),
    };
  }
}
