import { redis } from '../utils/redis';
import { logger } from '../utils/logger';

type CounterMap = Record<string, number>;

export class ScaleMetricsService {
  private static readonly COUNTERS_KEY = 'v3:metrics:counters';
  private static readonly GAUGES_KEY = 'v3:metrics:gauges';
  private static readonly ROLLUPS_KEY = 'v3:metrics:rollups';
  private static readonly TIMELINE_PREFIX = 'v3:metrics:timeline:';

  static async incrementCounter(name: string, amount = 1) {
    try {
      await redis.hincrby(this.COUNTERS_KEY, name, amount);
    } catch (error: any) {
      logger.warn('Metrics counter increment failed', { name, error: error?.message });
    }
  }

  static async setGauge(name: string, value: number) {
    try {
      await redis.hset(this.GAUGES_KEY, name, value.toString());
      await this.appendTimeline(name, value);
    } catch (error: any) {
      logger.warn('Metrics gauge update failed', { name, error: error?.message });
    }
  }

  static async observeDuration(name: string, durationMs: number) {
    const safeDuration = Math.max(0, Math.round(durationMs));
    try {
      await Promise.all([
        redis.hincrby(this.ROLLUPS_KEY, `${name}:count`, 1),
        redis.hincrby(this.ROLLUPS_KEY, `${name}:sum`, safeDuration),
        redis.hset(this.GAUGES_KEY, `${name}:last_ms`, safeDuration.toString()),
        this.appendTimeline(`${name}:last_ms`, safeDuration),
      ]);
    } catch (error: any) {
      logger.warn('Metrics duration observation failed', { name, error: error?.message });
    }
  }

  static async recordCacheOutcome(cacheName: string, hit: boolean) {
    await this.incrementCounter(`cache:${cacheName}:${hit ? 'hit' : 'miss'}`);
  }

  static async recordQueueDepth(queueName: string, counts: { waiting?: number; active?: number; delayed?: number; completed?: number; failed?: number }) {
    await Promise.all([
      this.setGauge(`queue:${queueName}:waiting`, counts.waiting || 0),
      this.setGauge(`queue:${queueName}:active`, counts.active || 0),
      this.setGauge(`queue:${queueName}:delayed`, counts.delayed || 0),
      this.setGauge(`queue:${queueName}:completed`, counts.completed || 0),
      this.setGauge(`queue:${queueName}:failed`, counts.failed || 0),
    ]);
  }

  static async recordProfileSync(event: 'upload' | 'download' | 'snapshot' | 'restore' | 'lock_conflict') {
    await this.incrementCounter(`profile:${event}`);
  }

  static async recordFingerprintValidation(result: 'pass' | 'warn' | 'fail') {
    await this.incrementCounter(`fingerprint:validation:${result}`);
  }

  static async getSnapshot() {
    try {
      const [counterRaw, gaugeRaw, rollupRaw] = await Promise.all([
        redis.hgetall(this.COUNTERS_KEY),
        redis.hgetall(this.GAUGES_KEY),
        redis.hgetall(this.ROLLUPS_KEY),
      ]);

      const counters = this.parseNumberMap(counterRaw);
      const gauges = this.parseNumberMap(gaugeRaw);
      const rollups = this.parseNumberMap(rollupRaw);

      return {
        counters,
        gauges,
        cache: this.buildCacheSummary(counters),
        durations: this.buildDurationSummary(rollups, gauges),
      };
    } catch (error: any) {
      logger.warn('Metrics snapshot failed', { error: error?.message });
      return {
        counters: {},
        gauges: {},
        cache: {},
        durations: {},
      };
    }
  }

  static async getHistory(metricNames: string[]) {
    try {
      const entries = await Promise.all(metricNames.map(async (name) => {
        const raw = await redis.lrange(`${this.TIMELINE_PREFIX}${name}`, 0, 49);
        return [name, raw.map((item) => JSON.parse(item))] as const;
      }));
      return Object.fromEntries(entries);
    } catch (error: any) {
      logger.warn('Metrics history fetch failed', { error: error?.message });
      return {};
    }
  }

  private static parseNumberMap(input: Record<string, string>): CounterMap {
    return Object.fromEntries(
      Object.entries(input || {}).map(([key, value]) => [key, Number(value) || 0])
    );
  }

  private static buildCacheSummary(counters: CounterMap) {
    const summary: Record<string, { hit: number; miss: number; hitRate: number }> = {};

    for (const [key, value] of Object.entries(counters)) {
      const match = key.match(/^cache:(.+):(hit|miss)$/);
      if (!match) continue;

      const [, cacheName, outcome] = match;
      const current = summary[cacheName] || { hit: 0, miss: 0, hitRate: 0 };
      current[outcome as 'hit' | 'miss'] = value;
      const total = current.hit + current.miss;
      current.hitRate = total > 0 ? Number((current.hit / total).toFixed(3)) : 0;
      summary[cacheName] = current;
    }

    return summary;
  }

  private static buildDurationSummary(rollups: CounterMap, gauges: CounterMap) {
    const summary: Record<string, { avgMs: number; count: number; lastMs: number }> = {};

    for (const [key, value] of Object.entries(rollups)) {
      const match = key.match(/^(.+):(count|sum)$/);
      if (!match) continue;

      const [, name, kind] = match;
      const current = summary[name] || { avgMs: 0, count: 0, lastMs: gauges[`${name}:last_ms`] || 0 };
      if (kind === 'count') current.count = value;
      if (kind === 'sum') current.avgMs = value;
      summary[name] = current;
    }

    for (const [name, current] of Object.entries(summary)) {
      current.avgMs = current.count > 0 ? Number((current.avgMs / current.count).toFixed(1)) : 0;
      current.lastMs = gauges[`${name}:last_ms`] || 0;
    }

    return summary;
  }

  private static async appendTimeline(name: string, value: number) {
    const key = `${this.TIMELINE_PREFIX}${name}`;
    const payload = JSON.stringify({
      timestamp: Date.now(),
      value: Number(value) || 0,
    });
    await redis.lpush(key, payload);
    await redis.ltrim(key, 0, 49);
  }
}
