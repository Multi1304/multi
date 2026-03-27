import crypto from 'crypto';
import { redis } from '../utils/redis';
import { BenchmarkSeriesService, BenchmarkSeriesSnapshot } from './benchmarkSeries.service';
import { ReleaseGateService, ReleaseGateSnapshot } from './releaseGate.service';
import { LongRunSoakProfileSnapshot, LongRunSoakService } from './longRunSoak.service';

export interface WeeklyComparativeReport {
  id: string;
  tenantId: string;
  createdAt: string;
  windows: {
    current: { start: string; end: string };
    previous: { start: string; end: string };
  };
  summary: {
    trend: 'improved' | 'stable' | 'regressed';
    overallDelta: number;
    benchmarkDelta: number;
    releaseGateDelta: number;
    soakDelta: number;
    releaseReadiness: 'ready' | 'review' | 'hold';
  };
  sources: {
    benchmark: {
      current: ReturnType<typeof BenchmarkSeriesService.summarize>;
      previous: ReturnType<typeof BenchmarkSeriesService.summarize>;
    };
    releaseGates: {
      current: ReleaseWindowSummary;
      previous: ReleaseWindowSummary;
    };
    longRunSoak: {
      current: SoakWindowSummary;
      previous: SoakWindowSummary;
    };
  };
  highlights: string[];
  risks: string[];
  recommendations: string[];
  strongestAreas: string[];
  weakestAreas: string[];
}

interface ReleaseWindowSummary {
  samples: number;
  averageScore: number;
  passRate: number;
  warningRate: number;
  failRate: number;
  latestStatus: 'pass' | 'warning' | 'fail' | 'unknown';
}

interface SoakWindowSummary {
  samples: number;
  averageScore: number;
  blockedRate: number;
  warningRate: number;
  latestStatus: 'ready' | 'warning' | 'blocked' | 'unknown';
  releaseReadiness: 'ready' | 'review' | 'hold';
}

export class WeeklyComparativeReportService {
  private static historyKey(tenantId: string) {
    return `v3:weekly-report:${tenantId}`;
  }

  private static freshnessKey(tenantId: string) {
    return `v3:weekly-report:fresh:${tenantId}`;
  }

  static async getSnapshot(tenantId: string, now = new Date()) {
    const [benchmarkHistory, releaseHistory, modestHistory, loadedHistory] = await Promise.all([
      BenchmarkSeriesService.getHistory(tenantId, 56),
      ReleaseGateService.getHistory(tenantId, 672),
      LongRunSoakService.getHistory(tenantId, 'modest_hardware', 56),
      LongRunSoakService.getHistory(tenantId, 'loaded_hardware', 56),
    ]);

    return this.buildFromHistories(tenantId, {
      benchmarkHistory,
      releaseHistory,
      modestHistory,
      loadedHistory,
      now,
    });
  }

  static buildFromHistories(
    tenantId: string,
    payload: {
      benchmarkHistory: BenchmarkSeriesSnapshot[];
      releaseHistory: ReleaseGateSnapshot[];
      modestHistory: LongRunSoakProfileSnapshot[];
      loadedHistory: LongRunSoakProfileSnapshot[];
      now?: Date;
    }
  ): WeeklyComparativeReport {
    const now = payload.now || new Date();
    const currentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const previousStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const partition = <T extends { createdAt: string }>(items: T[]) => ({
      current: items.filter((item) => {
        const createdAt = new Date(item.createdAt).getTime();
        return createdAt >= currentStart.getTime() && createdAt <= now.getTime();
      }),
      previous: items.filter((item) => {
        const createdAt = new Date(item.createdAt).getTime();
        return createdAt >= previousStart.getTime() && createdAt < currentStart.getTime();
      }),
    });

    const benchmark = partition(payload.benchmarkHistory);
    const releaseGates = partition(payload.releaseHistory);
    const modestSoak = partition(payload.modestHistory);
    const loadedSoak = partition(payload.loadedHistory);

    const benchmarkCurrent = BenchmarkSeriesService.summarize(benchmark.current);
    const benchmarkPrevious = BenchmarkSeriesService.summarize(benchmark.previous);
    const releaseCurrent = this.summarizeReleaseWindow(releaseGates.current);
    const releasePrevious = this.summarizeReleaseWindow(releaseGates.previous);
    const soakCurrent = this.summarizeSoakWindow([...modestSoak.current, ...loadedSoak.current]);
    const soakPrevious = this.summarizeSoakWindow([...modestSoak.previous, ...loadedSoak.previous]);

    const benchmarkDelta = benchmarkCurrent.averageScore - benchmarkPrevious.averageScore;
    const releaseGateDelta = releaseCurrent.averageScore - releasePrevious.averageScore;
    const soakDelta = soakCurrent.averageScore - soakPrevious.averageScore;
    const overallDelta = Math.round((benchmarkDelta + releaseGateDelta + soakDelta) / 3);

    const strongestAreas = [
      { label: 'Benchmark consistency', delta: benchmarkDelta },
      { label: 'Release gate discipline', delta: releaseGateDelta },
      { label: 'Long-run soak stability', delta: soakDelta },
    ]
      .filter((item) => item.delta > 1)
      .sort((a, b) => b.delta - a.delta)
      .map((item) => `${item.label} improved by ${item.delta} point(s).`);

    const weakestAreas = [
      { label: 'Benchmark consistency', delta: benchmarkDelta },
      { label: 'Release gate discipline', delta: releaseGateDelta },
      { label: 'Long-run soak stability', delta: soakDelta },
    ]
      .filter((item) => item.delta < -1)
      .sort((a, b) => a.delta - b.delta)
      .map((item) => `${item.label} regressed by ${Math.abs(item.delta)} point(s).`);

    const highlights: string[] = [];
    const risks: string[] = [];
    const recommendations: string[] = [];

    if (benchmarkCurrent.releaseReadiness === 'ready' && benchmarkDelta >= 0) {
      highlights.push(`Benchmark series is ${benchmarkCurrent.releaseReadiness} with consistency ${benchmarkCurrent.consistencyScore}.`);
    }
    if (releaseCurrent.failRate === 0 && releaseCurrent.samples > 0) {
      highlights.push('Release gates stayed out of fail state across the current weekly window.');
    }
    if (soakCurrent.releaseReadiness === 'ready') {
      highlights.push('Long-run soak stayed ready across modest and loaded hardware profiles.');
    }

    if (benchmarkCurrent.releaseReadiness === 'hold') {
      risks.push('Benchmark trend is weak enough to block promotion confidence this week.');
    }
    if (releaseCurrent.failRate > releasePrevious.failRate) {
      risks.push('Release gate failures are climbing compared with the previous week.');
    }
    if (soakCurrent.releaseReadiness !== 'ready') {
      risks.push('Long-run soak is not fully ready, so scale assumptions still need caution.');
    }
    if (weakestAreas.length === 0 && risks.length === 0) {
      risks.push('No material weekly regression detected in the sampled data.');
    }

    if (benchmarkCurrent.releaseReadiness !== 'ready') {
      recommendations.push('Keep flows and presets in review until benchmark readiness turns green again.');
    }
    if (releaseCurrent.failRate > 5) {
      recommendations.push('Inspect the release gate items with the largest negative delta before promoting new defaults.');
    }
    if (soakCurrent.releaseReadiness !== 'ready') {
      recommendations.push('Record another long-run soak after memory and queue pressure are reduced.');
    }
    if (recommendations.length === 0) {
      recommendations.push('Use this report as the weekly approval brief before promoting presets or raising concurrency.');
    }

    const releaseReadiness =
      benchmarkCurrent.releaseReadiness === 'hold' ||
      soakCurrent.releaseReadiness === 'hold' ||
      releaseCurrent.failRate > 5
        ? 'hold'
        : benchmarkCurrent.releaseReadiness === 'review' ||
            soakCurrent.releaseReadiness === 'review' ||
            releaseCurrent.warningRate > 10
          ? 'review'
          : 'ready';

    return {
      id: crypto.randomUUID(),
      tenantId,
      createdAt: now.toISOString(),
      windows: {
        current: { start: currentStart.toISOString(), end: now.toISOString() },
        previous: { start: previousStart.toISOString(), end: currentStart.toISOString() },
      },
      summary: {
        trend: overallDelta > 3 ? 'improved' : overallDelta < -3 ? 'regressed' : 'stable',
        overallDelta,
        benchmarkDelta,
        releaseGateDelta,
        soakDelta,
        releaseReadiness,
      },
      sources: {
        benchmark: {
          current: benchmarkCurrent,
          previous: benchmarkPrevious,
        },
        releaseGates: {
          current: releaseCurrent,
          previous: releasePrevious,
        },
        longRunSoak: {
          current: soakCurrent,
          previous: soakPrevious,
        },
      },
      highlights,
      risks,
      recommendations,
      strongestAreas,
      weakestAreas,
    };
  }

  static async recordSnapshot(tenantId: string) {
    const snapshot = await this.getSnapshot(tenantId);
    await redis.lpush(this.historyKey(tenantId), JSON.stringify(snapshot));
    await redis.ltrim(this.historyKey(tenantId), 0, 11);
    await redis.set(this.freshnessKey(tenantId), snapshot.createdAt, 'EX', 6 * 24 * 60 * 60);
    return snapshot;
  }

  static async maybeRecordSnapshot(tenantId: string) {
    const fresh = await redis.get(this.freshnessKey(tenantId));
    if (fresh) {
      return this.getLatestStored(tenantId) || this.getSnapshot(tenantId);
    }
    return this.recordSnapshot(tenantId);
  }

  static async getHistory(tenantId: string, limit = 8) {
    const rows = await redis.lrange(this.historyKey(tenantId), 0, Math.max(0, limit - 1));
    return rows.map((row) => JSON.parse(row) as WeeklyComparativeReport);
  }

  static async getLatestStored(tenantId: string) {
    const row = await redis.lindex(this.historyKey(tenantId), 0);
    return row ? (JSON.parse(row) as WeeklyComparativeReport) : null;
  }

  private static summarizeReleaseWindow(history: ReleaseGateSnapshot[]): ReleaseWindowSummary {
    if (!history.length) {
      return { samples: 0, averageScore: 0, passRate: 0, warningRate: 0, failRate: 0, latestStatus: 'unknown' };
    }

    const samples = history.length;
    const passCount = history.filter((item) => item.status === 'pass').length;
    const warningCount = history.filter((item) => item.status === 'warning').length;
    const failCount = history.filter((item) => item.status === 'fail').length;
    return {
      samples,
      averageScore: Math.round(history.reduce((sum, item) => sum + item.overallScore, 0) / samples),
      passRate: Math.round((passCount / samples) * 100),
      warningRate: Math.round((warningCount / samples) * 100),
      failRate: Math.round((failCount / samples) * 100),
      latestStatus: history[0]?.status || 'unknown',
    };
  }

  private static summarizeSoakWindow(history: LongRunSoakProfileSnapshot[]): SoakWindowSummary {
    if (!history.length) {
      return { samples: 0, averageScore: 0, blockedRate: 0, warningRate: 0, latestStatus: 'unknown', releaseReadiness: 'hold' };
    }

    const samples = history.length;
    const blockedCount = history.filter((item) => item.status === 'blocked').length;
    const warningCount = history.filter((item) => item.status === 'warning').length;
    const latestStatus = history[0]?.status || 'unknown';
    const releaseReadiness =
      latestStatus === 'blocked' ? 'hold' : latestStatus === 'warning' ? 'review' : 'ready';

    return {
      samples,
      averageScore: Math.round(history.reduce((sum, item) => sum + item.overallScore, 0) / samples),
      blockedRate: Math.round((blockedCount / samples) * 100),
      warningRate: Math.round((warningCount / samples) * 100),
      latestStatus,
      releaseReadiness,
    };
  }
}
