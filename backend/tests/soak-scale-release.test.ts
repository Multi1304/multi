import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/prisma';
import { redis } from '../src/utils/redis';
import { QueueService } from '../src/services/queue.service';
import { MemoryAdmissionService } from '../src/services/memoryAdmission.service';
import { ScaleMetricsService } from '../src/services/scaleMetrics.service';
import { SoakTestService } from '../src/services/soakTest.service';
import { ScaleReleaseCriteriaService } from '../src/services/scaleReleaseCriteria.service';
import { ReleaseGateService } from '../src/services/releaseGate.service';
import { RuntimeHardeningService } from '../src/services/runtimeHardening.service';

vi.mock('../src/prisma', () => ({
  prisma: {
    flowRun: { findMany: vi.fn() },
    profile: { findMany: vi.fn() },
    fingerprintPreset: { findMany: vi.fn() },
  },
}));

vi.mock('../src/utils/redis', () => ({
  redis: {
    lpush: vi.fn(),
    ltrim: vi.fn(),
    set: vi.fn(),
    get: vi.fn(),
    lrange: vi.fn(),
  },
}));

describe('soak and scale release services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a soak snapshot from recent runs and runtime signals', async () => {
    (prisma.flowRun.findMany as any).mockResolvedValue([
      { id: 'run-1', status: 'completed', duration: 1200, flow: { name: 'A' }, steps: [] },
      { id: 'run-2', status: 'failed', duration: 2400, flow: { name: 'B' }, steps: [] },
      { id: 'run-3', status: 'completed', duration: 1600, flow: { name: 'A' }, steps: [] },
    ]);
    vi.spyOn(QueueService, 'getRuntimeStats').mockResolvedValue({ waiting: 3, failed: 1, active: 2 } as any);
    vi.spyOn(MemoryAdmissionService, 'snapshot').mockReturnValue({ admitted: true, rssMb: 520, maxRssMb: 900 } as any);
    vi.spyOn(ScaleMetricsService, 'getHistory').mockResolvedValue({
      'queue:camelfarm-sessions:waiting': [{ value: 3 }],
      'queue:camelfarm-sessions:failed': [{ value: 1 }],
      'profiles:list_query:last_ms': [{ value: 140 }],
    } as any);

    const snapshot = await SoakTestService.getSnapshot('tenant-1', 180);
    expect(snapshot.metrics.totalRuns).toBe(3);
    expect(snapshot.items.length).toBe(5);
    expect(snapshot.overallScore).toBeGreaterThan(0);
  });

  it('blocks scale release when release gates or soak are failing', async () => {
    vi.spyOn(ReleaseGateService, 'maybeRecordSnapshot').mockResolvedValue({
      overallScore: 58,
      status: 'fail',
    } as any);
    vi.spyOn(SoakTestService, 'maybeRecordSnapshot').mockResolvedValue({
      overallScore: 54,
      status: 'fail',
    } as any);
    vi.spyOn(RuntimeHardeningService, 'buildSnapshot').mockReturnValue({
      overallScore: 70,
      status: 'warning',
      recommendations: ['Enable stricter runtime'],
    } as any);
    (prisma.fingerprintPreset.findMany as any).mockResolvedValue([]);
    (prisma.profile.findMany as any).mockResolvedValue([]);
    (prisma.flowRun.findMany as any).mockResolvedValue([
      { id: 'run-1', status: 'completed', duration: 1000, flow: { name: 'A' }, steps: [] },
      { id: 'run-2', status: 'failed', duration: 2000, flow: { name: 'A' }, steps: [] },
    ]);

    const evaluation = await ScaleReleaseCriteriaService.evaluate('tenant-1');
    expect(evaluation.ready).toBe(false);
    expect(evaluation.status).toBe('blocked');
    expect(evaluation.blockers.length).toBeGreaterThan(0);
  });
});
