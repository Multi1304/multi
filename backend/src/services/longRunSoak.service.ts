import crypto from 'crypto';
import { redis } from '../utils/redis';
import { SoakTestService } from './soakTest.service';

export interface LongRunSoakProfileSnapshot {
  id: string;
  tenantId: string;
  createdAt: string;
  profile: 'modest_hardware' | 'loaded_hardware';
  windowMinutes: number;
  targetConcurrency: number;
  overallScore: number;
  status: 'ready' | 'warning' | 'blocked';
  blockers: string[];
  warnings: string[];
  recommendations: string[];
  source: Awaited<ReturnType<typeof SoakTestService.getSnapshot>>;
}

export class LongRunSoakService {
  private static historyKey(tenantId: string, profile: string) {
    return `v3:longrun:soak:${tenantId}:${profile}`;
  }

  static async evaluateProfile(tenantId: string, profile: 'modest_hardware' | 'loaded_hardware') {
    const plan = profile === 'modest_hardware'
      ? { windowMinutes: 360, targetConcurrency: 4, minScore: 74, maxMemoryRssMb: 780, maxQueueWaiting: 6 }
      : { windowMinutes: 180, targetConcurrency: 8, minScore: 80, maxMemoryRssMb: 980, maxQueueWaiting: 12 };

    const source = await SoakTestService.getSnapshot(tenantId, plan.windowMinutes);
    const blockers: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    if (source.overallScore < plan.minScore) {
      blockers.push(`Overall soak score ${source.overallScore} is below the ${plan.minScore} target.`);
    }
    if (!source.metrics.memoryAdmitted || source.metrics.memoryRssMb > plan.maxMemoryRssMb) {
      blockers.push(`Memory pressure ${source.metrics.memoryRssMb}MB exceeds the ${plan.maxMemoryRssMb}MB target.`);
    }
    if (source.metrics.queueWaiting > plan.maxQueueWaiting) {
      warnings.push(`Queue waiting depth ${source.metrics.queueWaiting} is above the ${plan.maxQueueWaiting} target.`);
    }
    if (source.metrics.successRate < 90) {
      blockers.push(`Success rate ${source.metrics.successRate}% is too low for sustained ${profile}.`);
    } else if (source.metrics.successRate < 96) {
      warnings.push(`Success rate ${source.metrics.successRate}% still has room to improve.`);
    }

    if (warnings.length) {
      recommendations.push('Reduce concurrency bursts or tighten memory admission before widening default scale.');
    }
    if (blockers.length) {
      recommendations.push('Treat this load profile as blocked until the blockers are cleared.');
    }
    if (!warnings.length && !blockers.length) {
      recommendations.push(`This tenant is healthy enough for ${plan.targetConcurrency} concurrent profiles on the ${profile} plan.`);
    }

    const status: LongRunSoakProfileSnapshot['status'] = blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'warning' : 'ready';
    return {
      id: crypto.randomUUID(),
      tenantId,
      createdAt: new Date().toISOString(),
      profile,
      windowMinutes: plan.windowMinutes,
      targetConcurrency: plan.targetConcurrency,
      overallScore: source.overallScore,
      status,
      blockers,
      warnings,
      recommendations,
      source,
    } satisfies LongRunSoakProfileSnapshot;
  }

  static async recordAllProfiles(tenantId: string) {
    const snapshots = await Promise.all([
      this.evaluateProfile(tenantId, 'modest_hardware'),
      this.evaluateProfile(tenantId, 'loaded_hardware'),
    ]);
    await Promise.all(snapshots.map(async (snapshot) => {
      await redis.lpush(this.historyKey(tenantId, snapshot.profile), JSON.stringify(snapshot));
      await redis.ltrim(this.historyKey(tenantId, snapshot.profile), 0, 59);
    }));
    return snapshots;
  }

  static async getHistory(tenantId: string, profile: 'modest_hardware' | 'loaded_hardware', limit = 12) {
    const rows = await redis.lrange(this.historyKey(tenantId, profile), 0, Math.max(0, limit - 1));
    return rows.map((row) => JSON.parse(row) as LongRunSoakProfileSnapshot);
  }

  static summarize(history: LongRunSoakProfileSnapshot[]) {
    const latest = history[0] || null;
    const previous = history[1] || null;
    const averageScore = history.length
      ? Math.round(history.reduce((sum, item) => sum + item.overallScore, 0) / history.length)
      : 0;
    const delta = latest && previous ? latest.overallScore - previous.overallScore : 0;
    const blockedCount = history.filter((item) => item.status === 'blocked').length;
    const warningCount = history.filter((item) => item.status === 'warning').length;
    const releaseReadiness =
      latest?.status === 'blocked' ? 'hold' : latest?.status === 'warning' ? 'review' : 'ready';

    return {
      snapshots: history.length,
      averageScore,
      latestScore: latest?.overallScore || 0,
      latestStatus: latest?.status || 'unknown',
      delta,
      blockedCount,
      warningCount,
      releaseReadiness,
    };
  }
}
