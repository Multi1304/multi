import { describe, expect, it, vi } from 'vitest';
import { PromotionAdvisorService } from '../src/services/promotionAdvisor.service';
import { PromotionGateService } from '../src/services/promotionGate.service';
import { prisma } from '../src/prisma';

vi.mock('../src/prisma', () => ({
  prisma: {
    tenant: { findUnique: vi.fn() },
    fingerprintPreset: { findMany: vi.fn() },
    flow: { findMany: vi.fn() },
  }
}));

describe('promotion advisor', () => {
  it('suggests promotion for healthy unpromoted resources', async () => {
    vi.spyOn(PromotionGateService, 'getRegistry').mockResolvedValue({ presets: {}, flows: {} } as any);
    (prisma.fingerprintPreset.findMany as any).mockResolvedValue([{ id: 'preset-1', name: 'Preset 1' }]);
    (prisma.flow.findMany as any).mockResolvedValue([{ id: 'flow-1', name: 'Flow 1' }]);
    vi.spyOn(PromotionGateService, 'evaluatePresetPromotion').mockResolvedValue({
      allowed: true,
      score: 92,
      reasons: [],
      releaseGateStatus: 'pass',
      releaseGateScore: 90,
      sandboxCritical: 0,
    } as any);
    vi.spyOn(PromotionGateService, 'evaluateFlowPromotion').mockResolvedValue({
      allowed: true,
      score: 88,
      reasons: [],
      releaseGateStatus: 'pass',
      releaseGateScore: 90,
      sandboxCritical: 0,
    } as any);

    const report = await PromotionAdvisorService.getReport('tenant');
    expect(report.summary.promoteCount).toBeGreaterThan(0);
    expect(report.promote.some((item) => item.id === 'preset-1')).toBe(true);
    expect(report.promote.some((item) => item.id === 'flow-1')).toBe(true);
  });
});
