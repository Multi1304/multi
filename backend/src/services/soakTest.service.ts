import crypto from 'crypto';
import { prisma } from '../prisma';
import { redis } from '../utils/redis';
import { QueueService } from './queue.service';
import { MemoryAdmissionService } from './memoryAdmission.service';
import { FlowRunAnalysisService } from './flowRunAnalysis.service';
import { ScaleMetricsService } from './scaleMetrics.service';

export interface SoakTestItem {
  id: string;
  label: string;
  score: number;
  status: 'pass' | 'warning' | 'fail';
  detail: string;
}

export interface SoakTestSnapshot {
  id: string;
  tenantId: string;
  createdAt: string;
  windowMinutes: number;
  overallScore: number;
  status: 'pass' | 'warning' | 'fail';
  items: SoakTestItem[];
  metrics: {
    totalRuns: number;
    successRate: number;
    avgDurationMs: number;
    p95DurationMs: number;
    queueWaiting: number;
    queueFailed: number;
    memoryRssMb: number;
    memoryAdmitted: boolean;
  };
}

export class SoakTestService {
  private static historyKey(tenantId: string) {
    return `v3:soak:history:${tenantId}`;
  }

  private static freshnessKey(tenantId: string) {
    return `v3:soak:fresh:${tenantId}`;
  }

  static async getSnapshot(tenantId: string, windowMinutes = 180): Promise<SoakTestSnapshot> {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);
    const [runs, queueStats, memoryAdmission, metricHistory] = await Promise.all([
      (prisma as any).flowRun.findMany({
        where: { tenantId, createdAt: { gte: since } },
        include: { flow: { select: { name: true } }, steps: true },
        orderBy: { createdAt: 'desc' },
        take: 120,
      }),
      QueueService.getRuntimeStats(),
      Promise.resolve(MemoryAdmissionService.snapshot()),
      ScaleMetricsService.getHistory([
        'queue:camelfarm-sessions:waiting',
        'queue:camelfarm-sessions:failed',
        'profiles:list_query:last_ms',
      ]),
    ]);

    const analyzedRuns = runs.map((run: any) => FlowRunAnalysisService.augmentRun(run));
    const completedRuns = analyzedRuns.filter((run: any) => ['completed', 'success'].includes(String(run.status || '').toLowerCase()));
    const totalRuns = analyzedRuns.length;
    const successRate = totalRuns > 0 ? Math.round((completedRuns.length / totalRuns) * 100) : 0;
    const durations = analyzedRuns.map((run: any) => Number(run.duration || 0)).filter((value: number) => value > 0).sort((a: number, b: number) => a - b);
    const avgDurationMs = durations.length
      ? Math.round(durations.reduce((sum: number, value: number) => sum + value, 0) / durations.length)
      : 0;
    const p95DurationMs = durations.length
      ? durations[Math.min(durations.length - 1, Math.max(0, Math.ceil(durations.length * 0.95) - 1))]
      : 0;

    const queueWaitingTrend = this.latestValue(metricHistory?.['queue:camelfarm-sessions:waiting']);
    const queueFailedTrend = this.latestValue(metricHistory?.['queue:camelfarm-sessions:failed']);
    const latencyTrend = this.latestValue(metricHistory?.['profiles:list_query:last_ms']);

    const throughputScore = Math.max(0, Math.min(100, Math.round(successRate - Math.min(20, avgDurationMs / 1500))));
    const latencyScore = Math.max(0, Math.min(100, 100 - Math.round(Math.min(60, p95DurationMs / 250))));
    const queueScore = Math.max(0, Math.min(100, 100 - Math.round(Math.min(70, ((queueStats.waiting || 0) * 2) + ((queueStats.failed || 0) * 5)))));
    const memoryHeadroomScore = memoryAdmission.admitted
      ? Math.max(0, Math.min(100, 100 - Math.round(Math.max(0, (memoryAdmission.rssMb - (memoryAdmission.maxRssMb * 0.55))) / 8)))
      : 15;
    const trendScore = Math.max(0, Math.min(100, 100 - Math.round(Math.min(70, (queueWaitingTrend * 2) + (queueFailedTrend * 6) + (latencyTrend / 80)))));

    const items: SoakTestItem[] = [
      {
        id: 'throughput',
        label: 'Throughput Stability',
        score: throughputScore,
        status: this.statusFor(throughputScore),
        detail: `${completedRuns.length}/${totalRuns || 0} runs completed successfully in the last ${windowMinutes} minutes.`,
      },
      {
        id: 'latency',
        label: 'Latency Resilience',
        score: latencyScore,
        status: this.statusFor(latencyScore),
        detail: `Average duration ${avgDurationMs}ms, p95 ${p95DurationMs}ms.`,
      },
      {
        id: 'queue',
        label: 'Queue Elasticity',
        score: queueScore,
        status: this.statusFor(queueScore),
        detail: `Queue waiting ${queueStats.waiting || 0}, failed ${queueStats.failed || 0}.`,
      },
      {
        id: 'memory',
        label: 'Memory Headroom',
        score: memoryHeadroomScore,
        status: this.statusFor(memoryHeadroomScore),
        detail: memoryAdmission.admitted
          ? `Admission open at ${memoryAdmission.rssMb}MB RSS of ${memoryAdmission.maxRssMb}MB max.`
          : `Admission blocked at ${memoryAdmission.rssMb}MB RSS.`,
      },
      {
        id: 'trend',
        label: 'Trend Pressure',
        score: trendScore,
        status: this.statusFor(trendScore),
        detail: `Recent queue trend waiting ${queueWaitingTrend}, failed ${queueFailedTrend}, latency ${latencyTrend}ms.`,
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
      windowMinutes,
      overallScore,
      status: failCount > 0 ? 'fail' : warningCount > 0 ? 'warning' : 'pass',
      items,
      metrics: {
        totalRuns,
        successRate,
        avgDurationMs,
        p95DurationMs,
        queueWaiting: Number(queueStats.waiting || 0),
        queueFailed: Number(queueStats.failed || 0),
        memoryRssMb: Number(memoryAdmission.rssMb || 0),
        memoryAdmitted: !!memoryAdmission.admitted,
      },
    };
  }

  static async recordSnapshot(tenantId: string, windowMinutes = 180) {
    const snapshot = await this.getSnapshot(tenantId, windowMinutes);
    await redis.lpush(this.historyKey(tenantId), JSON.stringify(snapshot));
    await redis.ltrim(this.historyKey(tenantId), 0, 19);
    await redis.set(this.freshnessKey(tenantId), snapshot.createdAt, 'EX', 600);
    await ScaleMetricsService.setGauge('soak:overall', snapshot.overallScore);
    await ScaleMetricsService.incrementCounter(`soak:${snapshot.status}`);
    return snapshot;
  }

  static async maybeRecordSnapshot(tenantId: string, windowMinutes = 180) {
    const fresh = await redis.get(this.freshnessKey(tenantId));
    if (fresh) {
      return this.getSnapshot(tenantId, windowMinutes);
    }
    return this.recordSnapshot(tenantId, windowMinutes);
  }

  static async getHistory(tenantId: string) {
    const rows = await redis.lrange(this.historyKey(tenantId), 0, 9);
    return rows.map((row) => JSON.parse(row) as SoakTestSnapshot);
  }

  private static latestValue(history: any[] | undefined) {
    if (!Array.isArray(history) || history.length === 0) return 0;
    return Number(history[0]?.value || 0);
  }

  private static statusFor(score: number): 'pass' | 'warning' | 'fail' {
    if (score >= 80) return 'pass';
    if (score >= 60) return 'warning';
    return 'fail';
  }
}
