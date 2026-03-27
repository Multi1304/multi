import { prisma } from '../prisma';
import { PromotionGateService } from './promotionGate.service';

type PromotionResource = 'preset' | 'flow';

export interface PromotionAdvisorItem {
  resource: PromotionResource;
  id: string;
  name: string;
  currentState: 'recommended' | 'default' | null;
  suggestedAction: 'promote_recommended' | 'promote_default' | 'review_current' | 'retain';
  score: number;
  reasons: string[];
}

export interface PromotionAdvisorSummary {
  promoteCount: number;
  reviewCount: number;
  retainCount: number;
}

export interface PromotionAdvisorReport {
  summary: PromotionAdvisorSummary;
  promote: PromotionAdvisorItem[];
  review: PromotionAdvisorItem[];
  retain: PromotionAdvisorItem[];
}

export class PromotionAdvisorService {
  static async getReport(tenantId: string): Promise<PromotionAdvisorReport> {
    const [registry, presets, flows] = await Promise.all([
      PromotionGateService.getRegistry(tenantId),
      (prisma.fingerprintPreset as any).findMany({
        where: { tenantId },
        orderBy: [{ name: 'asc' }],
        take: 12,
      }),
      (prisma as any).flow.findMany({
        where: { tenantId },
        orderBy: [{ updatedAt: 'desc' }],
        take: 12,
      }),
    ]);

    const items: PromotionAdvisorItem[] = [];

    for (const preset of presets) {
      const currentState = registry.presets[preset.id]?.state || null;
      if (currentState === 'default') {
        const evaluation = await PromotionGateService.evaluatePresetPromotion(tenantId, preset.id, 'default');
        items.push({
          resource: 'preset',
          id: preset.id,
          name: preset.name,
          currentState,
          suggestedAction: evaluation.allowed ? 'retain' : 'review_current',
          score: evaluation.score,
          reasons: evaluation.allowed ? ['Default preset still passes release gates.'] : evaluation.reasons,
        });
        continue;
      }

      if (currentState === 'recommended') {
        const elevate = await PromotionGateService.evaluatePresetPromotion(tenantId, preset.id, 'default');
        items.push({
          resource: 'preset',
          id: preset.id,
          name: preset.name,
          currentState,
          suggestedAction: elevate.allowed ? 'promote_default' : 'retain',
          score: elevate.score,
          reasons: elevate.allowed ? ['Recommended preset is healthy enough to become default.'] : elevate.reasons,
        });
        continue;
      }

      const recommend = await PromotionGateService.evaluatePresetPromotion(tenantId, preset.id, 'recommended');
      items.push({
        resource: 'preset',
        id: preset.id,
        name: preset.name,
        currentState,
        suggestedAction: recommend.allowed ? 'promote_recommended' : 'retain',
        score: recommend.score,
        reasons: recommend.allowed ? ['Preset passes gates for recommended tier.'] : recommend.reasons,
      });
    }

    for (const flow of flows) {
      const currentState = registry.flows[flow.id]?.state || null;
      if (currentState === 'default') {
        const evaluation = await PromotionGateService.evaluateFlowPromotion(tenantId, flow.id, 'default');
        items.push({
          resource: 'flow',
          id: flow.id,
          name: flow.name,
          currentState,
          suggestedAction: evaluation.allowed ? 'retain' : 'review_current',
          score: evaluation.score,
          reasons: evaluation.allowed ? ['Default flow still passes release gates.'] : evaluation.reasons,
        });
        continue;
      }

      if (currentState === 'recommended') {
        const elevate = await PromotionGateService.evaluateFlowPromotion(tenantId, flow.id, 'default');
        items.push({
          resource: 'flow',
          id: flow.id,
          name: flow.name,
          currentState,
          suggestedAction: elevate.allowed ? 'promote_default' : 'retain',
          score: elevate.score,
          reasons: elevate.allowed ? ['Recommended flow is healthy enough to become default.'] : elevate.reasons,
        });
        continue;
      }

      const recommend = await PromotionGateService.evaluateFlowPromotion(tenantId, flow.id, 'recommended');
      items.push({
        resource: 'flow',
        id: flow.id,
        name: flow.name,
        currentState,
        suggestedAction: recommend.allowed ? 'promote_recommended' : 'retain',
        score: recommend.score,
        reasons: recommend.allowed ? ['Flow passes gates for recommended tier.'] : recommend.reasons,
      });
    }

    const promote = items
      .filter((item) => item.suggestedAction === 'promote_recommended' || item.suggestedAction === 'promote_default')
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
    const review = items
      .filter((item) => item.suggestedAction === 'review_current')
      .sort((a, b) => a.score - b.score)
      .slice(0, 8);
    const retain = items
      .filter((item) => item.suggestedAction === 'retain')
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    return {
      summary: {
        promoteCount: promote.length,
        reviewCount: review.length,
        retainCount: retain.length,
      },
      promote,
      review,
      retain,
    };
  }
}
