import { prisma } from '../prisma';
import { ReleaseGateService } from './releaseGate.service';
import { SoakTestService } from './soakTest.service';
import { RuntimeHardeningService } from './runtimeHardening.service';
import { PlatformBenchmarkService } from './platformBenchmark.service';
import { FlowRunAnalysisService } from './flowRunAnalysis.service';
import { InfrastructureHealthService } from './infrastructureHealth.service';
import { LongRunSoakService } from './longRunSoak.service';

export interface ScaleReleaseEvaluation {
  ready: boolean;
  score: number;
  status: 'ready' | 'caution' | 'blocked';
  blockers: string[];
  warnings: string[];
  recommendations: string[];
  recommendedConcurrencyCap: number;
  evidence: {
    releaseGateStatus: string;
    releaseGateScore: number;
    soakStatus: string;
    soakScore: number;
    infrastructureStatus: string;
    infrastructureScore: number;
    longRunModestStatus: string;
    longRunLoadedStatus: string;
    runtimeStatus: string;
    runtimeScore: number;
    benchmarkSuccessRate: number;
    benchmarkAverageStability: number;
  };
}

export class ScaleReleaseCriteriaService {
  static async evaluate(tenantId: string): Promise<ScaleReleaseEvaluation> {
    const [releaseGate, soak, presets, profiles, recentRuns, infrastructure, longRunModest, longRunLoaded] = await Promise.all([
      ReleaseGateService.maybeRecordSnapshot(tenantId),
      SoakTestService.maybeRecordSnapshot(tenantId),
      (prisma.fingerprintPreset as any).findMany({
        where: { tenantId },
        select: { id: true, name: true, platform: true, browser: true, config: true },
      }),
      (prisma.profile as any).findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          platform: true,
          proxyConfig: true,
          fingerprint: true,
          fingerprintPresetId: true,
        },
      }),
      (prisma as any).flowRun.findMany({
        where: { tenantId },
        include: { flow: { select: { name: true } }, steps: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      InfrastructureHealthService.getSnapshot(),
      LongRunSoakService.evaluateProfile(tenantId, 'modest_hardware'),
      LongRunSoakService.evaluateProfile(tenantId, 'loaded_hardware'),
    ]);

    const runtime = RuntimeHardeningService.buildSnapshot(presets, profiles);
    const analyzedRuns = recentRuns.map((run: any) => FlowRunAnalysisService.augmentRun(run));
    const benchmark = PlatformBenchmarkService.summarizeOverall(analyzedRuns);
    const blockers: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    if (releaseGate.status === 'fail') blockers.push('Release gates are failing.');
    else if (releaseGate.status === 'warning') warnings.push('Release gates are in warning state.');

    if (soak.status === 'fail') blockers.push('Soak testing shows unstable behavior under sustained load.');
    else if (soak.status === 'warning') warnings.push('Soak testing shows mild degradation under load.');

    if (infrastructure.status === 'critical') blockers.push('Infrastructure baseline is not ready for reliable scaling.');
    else if (infrastructure.status === 'warning') warnings.push('Infrastructure baseline still has warnings.');

    if (longRunModest.status === 'blocked') blockers.push('Long-run soak for modest hardware is blocked.');
    else if (longRunModest.status === 'warning') warnings.push('Long-run soak for modest hardware is under pressure.');

    if (longRunLoaded.status === 'blocked') blockers.push('Long-run soak for loaded hardware is blocked.');
    else if (longRunLoaded.status === 'warning') warnings.push('Long-run soak for loaded hardware is under pressure.');

    if (runtime.status === 'critical') blockers.push('Runtime hardening is below safe thresholds.');
    else if (runtime.status === 'warning') warnings.push('Runtime hardening still needs tightening before aggressive growth.');

    if (benchmark.successRate < 80) blockers.push(`Recent benchmark success rate is only ${benchmark.successRate}%.`);
    else if (benchmark.successRate < 92) warnings.push(`Recent benchmark success rate is ${benchmark.successRate}% and should improve.`);

    if (benchmark.averageStabilityScore < 65) blockers.push('Average benchmark stability is too low for confident scale promotion.');
    else if (benchmark.averageStabilityScore < 80) warnings.push('Average benchmark stability is acceptable but not elite yet.');

    if (releaseGate.overallScore < 85) {
      recommendations.push('Improve release-gate weakest items before widening default rollouts.');
    }
    if (infrastructure.status !== 'healthy') {
      recommendations.push(infrastructure.userGuidance.nextAction);
    }
    if (soak.overallScore < 85) {
      recommendations.push('Run another soak cycle after queue and memory tuning changes.');
    }
    if (longRunLoaded.status !== 'ready') {
      recommendations.push(longRunLoaded.recommendations[0]);
    }
    if (runtime.recommendations.length) {
      recommendations.push(runtime.recommendations[0]);
    }
    if (benchmark.weakestFlowScore < 70) {
      recommendations.push('Stabilize the weakest flow before increasing tenant-level concurrency defaults.');
    }

    const weightedScore = Math.round(
      (releaseGate.overallScore * 0.35) +
      (soak.overallScore * 0.2) +
      (runtime.overallScore * 0.15) +
      (benchmark.averageStabilityScore * 0.15) +
      (infrastructure.overallScore * 0.1) +
      (Math.round((longRunModest.overallScore + longRunLoaded.overallScore) / 2) * 0.05)
    );

    const recommendedConcurrencyCap = weightedScore >= 90 && longRunLoaded.status === 'ready'
      ? 10
      : weightedScore >= 80 && longRunModest.status === 'ready'
        ? 8
        : weightedScore >= 70
          ? 6
          : 4;

    return {
      ready: blockers.length === 0,
      score: weightedScore,
      status: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'caution' : 'ready',
      blockers,
      warnings,
      recommendations,
      recommendedConcurrencyCap,
      evidence: {
        releaseGateStatus: releaseGate.status,
        releaseGateScore: releaseGate.overallScore,
        soakStatus: soak.status,
        soakScore: soak.overallScore,
        infrastructureStatus: infrastructure.status,
        infrastructureScore: infrastructure.overallScore,
        longRunModestStatus: longRunModest.status,
        longRunLoadedStatus: longRunLoaded.status,
        runtimeStatus: runtime.status,
        runtimeScore: runtime.overallScore,
        benchmarkSuccessRate: benchmark.successRate,
        benchmarkAverageStability: benchmark.averageStabilityScore,
      },
    };
  }
}
