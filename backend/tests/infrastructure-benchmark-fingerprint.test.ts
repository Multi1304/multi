import { afterEach, describe, expect, it, vi } from 'vitest';
import { redis } from '../src/utils/redis';
import { InfrastructureHealthService } from '../src/services/infrastructureHealth.service';
import { BenchmarkSeriesService } from '../src/services/benchmarkSeries.service';
import { FingerprintHardeningService } from '../src/services/fingerprintHardening.service';
import { LongRunSoakService } from '../src/services/longRunSoak.service';
import { WeeklyComparativeReportService } from '../src/services/weeklyComparativeReport.service';

describe('infrastructure health', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('flags old redis versions as upgrade candidates', async () => {
    vi.spyOn(redis, 'info').mockResolvedValue('redis_version:5.0.14\r\n' as any);

    const snapshot = await InfrastructureHealthService.getSnapshot();

    expect(snapshot.components.redis.connected).toBe(true);
    expect(snapshot.components.redis.meetsMinimum).toBe(false);
    expect(snapshot.recommendations[0]).toContain('redis:7.2-alpine');
  });
});

describe('benchmark series', () => {
  it('summarizes trend across snapshots', () => {
    const summary = BenchmarkSeriesService.summarize([
      {
        id: 'newer',
        tenantId: 'tenant',
        createdAt: new Date().toISOString(),
        metadata: { releaseLabel: 'v2', commitRef: 'b', dominantPresetVersion: 'corpus-v2' },
        overall: { totalRuns: 10, averageStabilityScore: 81, weakestFlowScore: 60, strongestFlowScore: 95, successRate: 92 },
        flows: [],
        presets: [],
        profiles: [],
      },
      {
        id: 'older',
        tenantId: 'tenant',
        createdAt: new Date().toISOString(),
        metadata: { releaseLabel: 'v1', commitRef: 'a', dominantPresetVersion: 'corpus-v1' },
        overall: { totalRuns: 10, averageStabilityScore: 72, weakestFlowScore: 55, strongestFlowScore: 88, successRate: 88 },
        flows: [],
        presets: [],
        profiles: [],
      },
    ]);

    expect(summary.trend).toBe('improving');
    expect(summary.strongestCommit?.commitRef).toBe('b');
    expect(summary.releaseReadiness).toBe('review');
    expect(summary.consistencyScore).toBeGreaterThan(0);
  });
});

describe('fingerprint hardening', () => {
  it('normalizes inconsistent fingerprints before runtime use', () => {
    const result = FingerprintHardeningService.harden({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
      screenResolution: '2400x1080',
      hardwareConcurrency: 7,
      deviceMemory: 7,
      deviceScaleFactor: 5,
      timezoneId: 'Mars/Base',
      webgl: { vendor: 'Unknown', renderer: 'Unknown' },
    });

    expect(result.fingerprint.screenResolution).toBe('1080x2400');
    expect(result.fingerprint.hardwareConcurrency).toBe(8);
    expect(result.fingerprint.deviceMemory).toBe(8);
    expect(result.fingerprint.deviceScaleFactor).toBeLessThanOrEqual(3);
    expect(result.fingerprint.timezoneId).toBe('Europe/Madrid');
    expect(result.fingerprint.plugins.length).toBeGreaterThan(0);
    expect(result.fingerprint.fonts.length).toBeGreaterThan(0);
    expect(result.riskLevel).toBe('hold');
    expect(result.adjustments.length).toBeGreaterThan(0);
  });
});

describe('long run soak summary', () => {
  it('derives release readiness from profile soak history', () => {
    const summary = LongRunSoakService.summarize([
      {
        id: 'latest',
        tenantId: 'tenant',
        createdAt: new Date().toISOString(),
        profile: 'modest_hardware',
        windowMinutes: 360,
        targetConcurrency: 4,
        overallScore: 82,
        status: 'warning',
        blockers: [],
        warnings: ['Queue waiting depth is above target.'],
        recommendations: ['Reduce concurrency bursts.'],
        source: { overallScore: 82, metrics: { successRate: 95, memoryAdmitted: true, memoryRssMb: 700, queueWaiting: 8 } } as any,
      },
      {
        id: 'older',
        tenantId: 'tenant',
        createdAt: new Date().toISOString(),
        profile: 'modest_hardware',
        windowMinutes: 360,
        targetConcurrency: 4,
        overallScore: 78,
        status: 'blocked',
        blockers: ['Success rate too low.'],
        warnings: [],
        recommendations: ['Treat this load profile as blocked.'],
        source: { overallScore: 78, metrics: { successRate: 88, memoryAdmitted: false, memoryRssMb: 900, queueWaiting: 12 } } as any,
      },
    ]);

    expect(summary.latestStatus).toBe('warning');
    expect(summary.releaseReadiness).toBe('review');
    expect(summary.blockedCount).toBe(1);
  });
});

describe('weekly comparative report', () => {
  it('compares the last 7 days against the previous 7 days', () => {
    const now = new Date('2026-03-19T12:00:00.000Z');
    const report = WeeklyComparativeReportService.buildFromHistories('tenant', {
      now,
      benchmarkHistory: [
        {
          id: 'b-current',
          tenantId: 'tenant',
          createdAt: '2026-03-18T12:00:00.000Z',
          metadata: { releaseLabel: 'v2', commitRef: 'b', dominantPresetVersion: 'corpus-v2' },
          overall: { totalRuns: 20, averageStabilityScore: 88, weakestFlowScore: 70, strongestFlowScore: 96, successRate: 96 },
          flows: [],
          presets: [],
          profiles: [],
        },
        {
          id: 'b-previous',
          tenantId: 'tenant',
          createdAt: '2026-03-10T12:00:00.000Z',
          metadata: { releaseLabel: 'v1', commitRef: 'a', dominantPresetVersion: 'corpus-v1' },
          overall: { totalRuns: 20, averageStabilityScore: 74, weakestFlowScore: 52, strongestFlowScore: 88, successRate: 89 },
          flows: [],
          presets: [],
          profiles: [],
        },
      ] as any,
      releaseHistory: [
        {
          id: 'r-current',
          tenantId: 'tenant',
          createdAt: '2026-03-18T09:00:00.000Z',
          overallScore: 91,
          status: 'pass',
          items: [],
          metadata: { releaseLabel: 'v2', commitRef: 'b', dominantPresetVersion: 'corpus-v2' },
        },
        {
          id: 'r-previous',
          tenantId: 'tenant',
          createdAt: '2026-03-11T09:00:00.000Z',
          overallScore: 73,
          status: 'warning',
          items: [],
          metadata: { releaseLabel: 'v1', commitRef: 'a', dominantPresetVersion: 'corpus-v1' },
        },
      ] as any,
      modestHistory: [
        {
          id: 's-current',
          tenantId: 'tenant',
          createdAt: '2026-03-17T08:00:00.000Z',
          profile: 'modest_hardware',
          windowMinutes: 360,
          targetConcurrency: 4,
          overallScore: 86,
          status: 'ready',
          blockers: [],
          warnings: [],
          recommendations: ['Healthy.'],
          source: { overallScore: 86 } as any,
        },
        {
          id: 's-previous',
          tenantId: 'tenant',
          createdAt: '2026-03-09T08:00:00.000Z',
          profile: 'modest_hardware',
          windowMinutes: 360,
          targetConcurrency: 4,
          overallScore: 75,
          status: 'warning',
          blockers: [],
          warnings: ['Queue drift.'],
          recommendations: ['Tighten memory admission.'],
          source: { overallScore: 75 } as any,
        },
      ] as any,
      loadedHistory: [
        {
          id: 'l-current',
          tenantId: 'tenant',
          createdAt: '2026-03-17T08:00:00.000Z',
          profile: 'loaded_hardware',
          windowMinutes: 180,
          targetConcurrency: 8,
          overallScore: 84,
          status: 'ready',
          blockers: [],
          warnings: [],
          recommendations: ['Healthy.'],
          source: { overallScore: 84 } as any,
        },
      ] as any,
    });

    expect(report.summary.trend).toBe('improved');
    expect(report.summary.releaseReadiness).toBe('ready');
    expect(report.summary.benchmarkDelta).toBeGreaterThan(0);
    expect(report.highlights.length).toBeGreaterThan(0);
    expect(report.recommendations[0]).toContain('weekly');
  });
});
