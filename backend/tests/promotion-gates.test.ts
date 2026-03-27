import { describe, expect, it, vi } from 'vitest';
import { PromotionGateService } from '../src/services/promotionGate.service';
import { ReleaseGateService } from '../src/services/releaseGate.service';
import { SandboxCompatibilityLabService } from '../src/services/sandboxCompatibilityLab.service';
import { FlowOperationalService } from '../src/services/flowOperational.service';
import { prisma } from '../src/prisma';

vi.mock('../src/prisma', () => ({
  prisma: {
    fingerprintPreset: { findFirst: vi.fn() },
    profile: { findMany: vi.fn() },
  }
}));

describe('promotion gates', () => {
  it('blocks preset promotion when release gates fail', async () => {
    vi.spyOn(ReleaseGateService, 'getSnapshot').mockResolvedValue({
      id: 'gate-1',
      tenantId: 'tenant',
      createdAt: new Date().toISOString(),
      overallScore: 40,
      status: 'fail',
      items: [],
      metadata: { releaseLabel: 'dev', commitRef: 'abc', dominantPresetVersion: 'corpus-v2', comparedTo: null },
    } as any);
    vi.spyOn(SandboxCompatibilityLabService, 'evaluateAll').mockResolvedValue({
      summary: { critical: 0, averageScore: 90 },
      rows: [],
      settings: { scenarios: [] },
    } as any);
    (prisma.fingerprintPreset.findFirst as any).mockResolvedValue({
      id: 'preset-1',
      config: { validation: { score: 92, issues: [] } },
    });
    (prisma.profile.findMany as any).mockResolvedValue([]);

    const evaluation = await PromotionGateService.evaluatePresetPromotion('tenant', 'preset-1', 'recommended');
    expect(evaluation.allowed).toBe(false);
    expect(evaluation.reasons[0]).toContain('release gates');
  });

  it('blocks flow default promotion when recent success rate is too low', async () => {
    vi.spyOn(ReleaseGateService, 'getSnapshot').mockResolvedValue({
      id: 'gate-2',
      tenantId: 'tenant',
      createdAt: new Date().toISOString(),
      overallScore: 88,
      status: 'pass',
      items: [],
      metadata: { releaseLabel: 'dev', commitRef: 'abc', dominantPresetVersion: 'corpus-v2', comparedTo: null },
    } as any);
    vi.spyOn(SandboxCompatibilityLabService, 'evaluateAll').mockResolvedValue({
      summary: { critical: 0, averageScore: 90 },
      rows: [],
      settings: { scenarios: [] },
    } as any);
    vi.spyOn(FlowOperationalService, 'listForFlow').mockResolvedValue([] as any);
    vi.spyOn(FlowOperationalService, 'summarize').mockReturnValue({ totalRuns: 4, completed: 2, failed: 4 } as any);

    const evaluation = await PromotionGateService.evaluateFlowPromotion('tenant', 'flow-1', 'default');
    expect(evaluation.allowed).toBe(false);
    expect(evaluation.reasons.join(' ')).toContain('below');
  });
});
