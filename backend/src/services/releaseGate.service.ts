import crypto from 'crypto';
import { prisma } from '../prisma';
import { redis } from '../utils/redis';
import { ScaleMetricsService } from './scaleMetrics.service';
import { FlowRunAnalysisService } from './flowRunAnalysis.service';
import { PlatformBenchmarkService } from './platformBenchmark.service';
import { FingerprintValidationService } from './fingerprintValidation.service';
import { ProfileOperationalService } from './profileOperational.service';
import { MemoryAdmissionService } from './memoryAdmission.service';
import { SandboxCompatibilityLabService } from './sandboxCompatibilityLab.service';
import { RuntimeHardeningService } from './runtimeHardening.service';
import { config } from '../config';

export interface ReleaseGateItem {
  id: string;
  label: string;
  score: number;
  threshold: number;
  status: 'pass' | 'warning' | 'fail';
  detail: string;
}

export interface ReleaseGateSnapshot {
  id: string;
  tenantId: string;
  createdAt: string;
  overallScore: number;
  status: 'pass' | 'warning' | 'fail';
  items: ReleaseGateItem[];
  metadata: {
    releaseLabel: string;
    commitRef: string;
    dominantPresetVersion: string;
    comparedTo?: string | null;
  };
}

export interface ReleaseGateComparison {
  current: ReleaseGateSnapshot;
  previous: ReleaseGateSnapshot | null;
  deltaOverallScore: number;
  itemDeltas: Array<{
    id: string;
    label: string;
    currentScore: number;
    previousScore: number | null;
    delta: number;
  }>;
  trend: 'improved' | 'stable' | 'regressed';
}

export class ReleaseGateService {
  private static historyKey(tenantId: string) {
    return `v3:release:gates:${tenantId}`;
  }

  private static freshnessKey(tenantId: string) {
    return `v3:release:gates:fresh:${tenantId}`;
  }

  static async getSnapshot(tenantId: string, metadata?: Partial<ReleaseGateSnapshot['metadata']>): Promise<ReleaseGateSnapshot> {
    const [runs, profiles, presets, metricsSnapshot, sandboxLab] = await Promise.all([
      (prisma as any).flowRun.findMany({
        where: { tenantId },
        include: { flow: { select: { name: true } }, steps: true },
        orderBy: { createdAt: 'desc' },
        take: 40,
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
      (prisma.fingerprintPreset as any).findMany({
        where: { tenantId },
        select: { id: true, name: true, platform: true, browser: true, config: true },
      }),
      ScaleMetricsService.getSnapshot(),
      SandboxCompatibilityLabService.evaluateAll(tenantId),
    ]);

    const analyzedRuns = runs.map((run: any) => FlowRunAnalysisService.augmentRun(run));
    const flowBenchmarks = PlatformBenchmarkService.summarizeRuns(analyzedRuns);
    const weakestFlowScore = flowBenchmarks.length ? flowBenchmarks[0].stabilityScore : 100;
    const weakestFlow = flowBenchmarks[0];

    const presetMatrix = FingerprintValidationService.buildMatrix(presets, profiles);
    const presetSummary = FingerprintValidationService.summarizeMatrix(presetMatrix);
    const profileSummary = ProfileOperationalService.summarize(profiles);
    const runtimeHardening = RuntimeHardeningService.buildSnapshot(presets, profiles);
    const memory = MemoryAdmissionService.snapshot();
    const queueWaiting = metricsSnapshot.gauges?.['queue:camelfarm-sessions:waiting'] || 0;
    const dominantPresetVersion = this.inferDominantPresetVersion(profiles, presets);

    const items: ReleaseGateItem[] = [
      {
        id: 'flow_stability',
        label: 'Flow Stability',
        score: weakestFlowScore,
        threshold: 60,
        status: this.statusFor(weakestFlowScore, 60),
        detail: weakestFlow
          ? `Weakest recent flow ${weakestFlow.flowName} scored ${weakestFlowScore}.`
          : 'No recent flows recorded.',
      },
      {
        id: 'fingerprint_matrix',
        label: 'Fingerprint Matrix',
        score: presetSummary.averageScore,
        threshold: 75,
        status: this.statusFor(presetSummary.averageScore, 75),
        detail: `${presetSummary.critical} critical presets across ${presetSummary.total}.`,
      },
      {
        id: 'profile_validation',
        label: 'Profile Validation',
        score: profileSummary.averageValidation,
        threshold: 75,
        status: this.statusFor(profileSummary.averageValidation, 75),
        detail: `${profileSummary.critical} critical profiles across ${profileSummary.total}.`,
      },
      {
        id: 'sandbox_compatibility',
        label: 'Sandbox Compatibility',
        score: sandboxLab.summary.averageScore || 0,
        threshold: 70,
        status: this.statusFor(sandboxLab.summary.averageScore || 0, 70),
        detail: `${sandboxLab.summary.critical || 0} critical sandbox scenarios.`,
      },
      {
        id: 'runtime_hardening',
        label: 'Runtime Hardening',
        score: runtimeHardening.overallScore,
        threshold: 80,
        status: this.statusFor(runtimeHardening.overallScore, 80),
        detail: runtimeHardening.recommendations[0] || 'Runtime hardening looks healthy.',
      },
      {
        id: 'capacity_headroom',
        label: 'Capacity Headroom',
        score: memory.admitted ? Math.max(0, 100 - Math.min(60, queueWaiting * 3)) : 20,
        threshold: 65,
        status: this.statusFor(memory.admitted ? Math.max(0, 100 - Math.min(60, queueWaiting * 3)) : 20, 65),
        detail: memory.admitted
          ? `Memory admitted, queue waiting ${queueWaiting}.`
          : `Memory admission blocked at ${memory.rssMb}MB RSS.`,
      },
    ];

    const overallScore = items.length
      ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length)
      : 0;
    const failCount = items.filter((item) => item.status === 'fail').length;
    const warningCount = items.filter((item) => item.status === 'warning').length;

    return {
      id: crypto.randomUUID(),
      tenantId,
      createdAt: new Date().toISOString(),
      overallScore,
      status: failCount > 0 ? 'fail' : warningCount > 0 ? 'warning' : 'pass',
      items,
      metadata: {
        releaseLabel: metadata?.releaseLabel || config.releaseGates.releaseLabel,
        commitRef: metadata?.commitRef || config.releaseGates.commitRef,
        dominantPresetVersion,
        comparedTo: metadata?.comparedTo || null,
      },
    };
  }

  static async recordSnapshot(tenantId: string, metadata?: Partial<ReleaseGateSnapshot['metadata']>) {
    const previous = (await this.getHistory(tenantId))[0] || null;
    const snapshot = await this.getSnapshot(tenantId, {
      ...metadata,
      comparedTo: previous?.id || null,
    });
    await redis.lpush(this.historyKey(tenantId), JSON.stringify(snapshot));
    await redis.ltrim(this.historyKey(tenantId), 0, 671);
    await redis.set(this.freshnessKey(tenantId), snapshot.createdAt, 'EX', 600);
    await ScaleMetricsService.setGauge('release:gates:overall', snapshot.overallScore);
    await ScaleMetricsService.incrementCounter(`release:gates:${snapshot.status}`);
    return snapshot;
  }

  static async maybeRecordSnapshot(tenantId: string) {
    const fresh = await redis.get(this.freshnessKey(tenantId));
    if (fresh) {
      return this.getSnapshot(tenantId);
    }
    return this.recordSnapshot(tenantId);
  }

  static async getHistory(tenantId: string, limit = 10) {
    const rows = await redis.lrange(this.historyKey(tenantId), 0, Math.max(0, limit - 1));
    return rows.map((row) => JSON.parse(row) as ReleaseGateSnapshot);
  }

  static compareSnapshots(current: ReleaseGateSnapshot, previous: ReleaseGateSnapshot | null): ReleaseGateComparison {
    const previousItems = new Map((previous?.items || []).map((item) => [item.id, item]));
    const itemDeltas = current.items.map((item) => {
      const prev = previousItems.get(item.id);
      return {
        id: item.id,
        label: item.label,
        currentScore: item.score,
        previousScore: prev?.score ?? null,
        delta: item.score - (prev?.score ?? item.score),
      };
    });
    const deltaOverallScore = current.overallScore - (previous?.overallScore ?? current.overallScore);
    return {
      current,
      previous,
      deltaOverallScore,
      itemDeltas,
      trend: deltaOverallScore > 3 ? 'improved' : deltaOverallScore < -3 ? 'regressed' : 'stable',
    };
  }

  private static inferDominantPresetVersion(profiles: any[], presets: any[]) {
    const presetVersionById = new Map<string, string>();
    presets.forEach((preset: any) => {
      presetVersionById.set(preset.id, preset?.config?.presetVersion || 'legacy');
    });
    const counts = new Map<string, number>();
    profiles.forEach((profile: any) => {
      const version =
        profile?.fingerprint?.presetVersion ||
        presetVersionById.get(profile?.fingerprintPresetId) ||
        'legacy';
      counts.set(version, (counts.get(version) || 0) + 1);
    });
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    return top?.[0] || 'legacy';
  }

  private static statusFor(score: number, threshold: number): 'pass' | 'warning' | 'fail' {
    if (score >= threshold) return 'pass';
    if (score >= Math.max(0, threshold - 15)) return 'warning';
    return 'fail';
  }
}
