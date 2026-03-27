import crypto from 'crypto';
import { prisma } from '../prisma';
import { redis } from '../utils/redis';
import { config } from '../config';
import { FlowRunAnalysisService } from './flowRunAnalysis.service';
import { PlatformBenchmarkService } from './platformBenchmark.service';

export interface BenchmarkSeriesSnapshot {
  id: string;
  tenantId: string;
  createdAt: string;
  metadata: {
    releaseLabel: string;
    commitRef: string;
    dominantPresetVersion: string;
  };
  overall: ReturnType<typeof PlatformBenchmarkService.summarizeOverall>;
  flows: ReturnType<typeof PlatformBenchmarkService.summarizeRuns>;
  presets: ReturnType<typeof PlatformBenchmarkService.summarizePresets>;
  profiles: ReturnType<typeof PlatformBenchmarkService.summarizeProfiles>;
}

export class BenchmarkSeriesService {
  private static historyKey(tenantId: string) {
    return `v3:benchmark:series:${tenantId}`;
  }

  private static freshnessKey(tenantId: string) {
    return `v3:benchmark:series:fresh:${tenantId}`;
  }

  static async getSnapshot(tenantId: string, metadata?: Partial<BenchmarkSeriesSnapshot['metadata']>): Promise<BenchmarkSeriesSnapshot> {
    const [runs, profiles] = await Promise.all([
      (prisma as any).flowRun.findMany({
        where: { tenantId },
        include: { flow: { select: { name: true } }, steps: true },
        orderBy: { createdAt: 'desc' },
        take: 120,
      }),
      (prisma.profile as any).findMany({
        where: { tenantId },
        select: {
          id: true,
          fingerprintPresetId: true,
          fingerprint: true,
        },
      }),
    ]);

    const analyzedRuns = runs.map((run: any) => FlowRunAnalysisService.augmentRun(run));
    const dominantPresetVersion = this.inferDominantPresetVersion(profiles);

    return {
      id: crypto.randomUUID(),
      tenantId,
      createdAt: new Date().toISOString(),
      metadata: {
        releaseLabel: metadata?.releaseLabel || config.releaseGates.releaseLabel,
        commitRef: metadata?.commitRef || config.releaseGates.commitRef,
        dominantPresetVersion: metadata?.dominantPresetVersion || dominantPresetVersion,
      },
      overall: PlatformBenchmarkService.summarizeOverall(analyzedRuns),
      flows: PlatformBenchmarkService.summarizeRuns(analyzedRuns).slice(0, 12),
      presets: PlatformBenchmarkService.summarizePresets(analyzedRuns, profiles).slice(0, 12),
      profiles: PlatformBenchmarkService.summarizeProfiles(analyzedRuns).slice(0, 12),
    };
  }

  static async recordSnapshot(tenantId: string, metadata?: Partial<BenchmarkSeriesSnapshot['metadata']>) {
    const snapshot = await this.getSnapshot(tenantId, metadata);
    await redis.lpush(this.historyKey(tenantId), JSON.stringify(snapshot));
    await redis.ltrim(this.historyKey(tenantId), 0, 179);
    await redis.set(this.freshnessKey(tenantId), snapshot.createdAt, 'EX', 4 * 60 * 60);
    return snapshot;
  }

  static async maybeRecordSnapshot(tenantId: string) {
    const fresh = await redis.get(this.freshnessKey(tenantId));
    if (fresh) return this.getSnapshot(tenantId);
    return this.recordSnapshot(tenantId);
  }

  static async getHistory(tenantId: string, limit = 24) {
    const rows = await redis.lrange(this.historyKey(tenantId), 0, Math.max(0, limit - 1));
    return rows.map((row) => JSON.parse(row) as BenchmarkSeriesSnapshot);
  }

  static summarize(history: BenchmarkSeriesSnapshot[]) {
    const latest = history[0] || null;
    const previous = history[1] || null;
    const recent = history.slice(0, 6);
    const avgScore = history.length
      ? Math.round(history.reduce((sum, item) => sum + (item.overall.averageStabilityScore || 0), 0) / history.length)
      : 0;
    const delta = latest && previous
      ? latest.overall.averageStabilityScore - previous.overall.averageStabilityScore
      : 0;
    const averageSuccessRate = history.length
      ? Math.round(history.reduce((sum, item) => sum + (item.overall.successRate || 0), 0) / history.length)
      : 0;
    const consistencyScore = recent.length
      ? Math.max(
          0,
          100 - Math.round(
            recent.reduce((sum, item) => sum + Math.abs((item.overall.averageStabilityScore || 0) - avgScore), 0) / recent.length
          )
        )
      : 0;
    const sustainedRegression = recent.length >= 3
      ? recent.every((item, index) => index === recent.length - 1 || (item.overall.averageStabilityScore || 0) < (recent[index + 1]?.overall.averageStabilityScore || 0))
      : false;
    const strongestCommit = history
      .slice()
      .sort((a, b) => b.overall.averageStabilityScore - a.overall.averageStabilityScore)[0];
    const releaseReadiness =
      sustainedRegression || (latest?.overall.averageStabilityScore || 0) < 72 || (latest?.overall.successRate || 0) < 90
        ? 'hold'
        : (latest?.overall.averageStabilityScore || 0) < 84 || consistencyScore < 85
          ? 'review'
          : 'ready';

    return {
      snapshots: history.length,
      averageScore: avgScore,
      latestScore: latest?.overall.averageStabilityScore || 0,
      latestSuccessRate: latest?.overall.successRate || 0,
      averageSuccessRate,
      consistencyScore,
      trend: delta > 3 ? 'improving' : delta < -3 ? 'regressing' : 'stable',
      delta,
      sustainedRegression,
      releaseReadiness,
      strongestCommit: strongestCommit
        ? {
            commitRef: strongestCommit.metadata.commitRef,
            releaseLabel: strongestCommit.metadata.releaseLabel,
            score: strongestCommit.overall.averageStabilityScore,
          }
        : null,
    };
  }

  private static inferDominantPresetVersion(profiles: any[]) {
    const counts = new Map<string, number>();
    profiles.forEach((profile: any) => {
      const version = profile?.fingerprint?.presetVersion || 'legacy';
      counts.set(version, (counts.get(version) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'legacy';
  }
}
