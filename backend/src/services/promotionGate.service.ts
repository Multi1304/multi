import { prisma } from '../prisma';
import { ReleaseGateService } from './releaseGate.service';
import { FingerprintValidationService } from './fingerprintValidation.service';
import { FlowOperationalService } from './flowOperational.service';
import { SandboxCompatibilityLabService } from './sandboxCompatibilityLab.service';

type PromotionTarget = 'recommended' | 'default';
type PromotionResource = 'preset' | 'flow';

interface PromotionRecord {
  state: PromotionTarget;
  promotedAt: string;
  promotedBy: string;
  gateSnapshotId: string;
  score: number;
}

interface PromotionRegistry {
  presets: Record<string, PromotionRecord>;
  flows: Record<string, PromotionRecord>;
}

export interface PromotionEvaluation {
  allowed: boolean;
  score: number;
  reasons: string[];
  releaseGateStatus: string;
  releaseGateScore: number;
  sandboxCritical: number;
}

export class PromotionGateService {
  private static normalizeRegistry(settings?: any): PromotionRegistry {
    const raw = settings?.promotionRegistry || {};
    return {
      presets: raw?.presets && typeof raw.presets === 'object' ? raw.presets : {},
      flows: raw?.flows && typeof raw.flows === 'object' ? raw.flows : {},
    };
  }

  static async getRegistry(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
    return this.normalizeRegistry(tenant.settings);
  }

  static async evaluatePresetPromotion(tenantId: string, presetId: string, target: PromotionTarget): Promise<PromotionEvaluation> {
    const [releaseGate, sandboxLab, preset, profiles] = await Promise.all([
      ReleaseGateService.getSnapshot(tenantId),
      SandboxCompatibilityLabService.evaluateAll(tenantId),
      (prisma.fingerprintPreset as any).findFirst({
        where: { id: presetId, tenantId },
      }),
      (prisma.profile as any).findMany({
        where: { tenantId },
        select: { id: true, fingerprintPresetId: true },
      }),
    ]);

    if (!preset) {
      return {
        allowed: false,
        score: 0,
        reasons: ['Preset not found.'],
        releaseGateStatus: releaseGate.status,
        releaseGateScore: releaseGate.overallScore,
        sandboxCritical: sandboxLab.summary.critical || 0,
      };
    }

    const matrix = FingerprintValidationService.buildMatrix([preset], profiles);
    const row = matrix[0];
    const reasons: string[] = [];
    const threshold = target === 'default' ? 85 : 75;

    if (releaseGate.status === 'fail') {
      reasons.push('Current release gates are failing.');
    }
    if ((sandboxLab.summary.critical || 0) > 0) {
      reasons.push('Sandbox compatibility lab currently has critical scenarios.');
    }
    if ((row?.validationScore || 0) < threshold) {
      reasons.push(`Preset validation score ${row?.validationScore || 0} is below the ${threshold} threshold for ${target}.`);
    }
    if ((row?.issueCount || 0) > (target === 'default' ? 0 : 2)) {
      reasons.push('Preset still has too many validation issues.');
    }

    return {
      allowed: reasons.length === 0,
      score: row?.validationScore || 0,
      reasons,
      releaseGateStatus: releaseGate.status,
      releaseGateScore: releaseGate.overallScore,
      sandboxCritical: sandboxLab.summary.critical || 0,
    };
  }

  static async evaluateFlowPromotion(tenantId: string, flowId: string, target: PromotionTarget): Promise<PromotionEvaluation> {
    const [releaseGate, sandboxLab, runs] = await Promise.all([
      ReleaseGateService.getSnapshot(tenantId),
      SandboxCompatibilityLabService.evaluateAll(tenantId),
      FlowOperationalService.listForFlow(tenantId, flowId, 12),
    ]);

    const summary = FlowOperationalService.summarize(runs);
    const completed = Number(summary?.completed || 0);
    const totalRuns = Number(summary?.totalRuns || 0);
    const successRate = totalRuns > 0 ? Math.round((completed / totalRuns) * 100) : 0;
    const threshold = target === 'default' ? 80 : 65;
    const reasons: string[] = [];

    if (releaseGate.status === 'fail') {
      reasons.push('Current release gates are failing.');
    }
    if ((sandboxLab.summary.critical || 0) > 0) {
      reasons.push('Sandbox compatibility lab currently has critical scenarios.');
    }
    if (successRate < threshold) {
      reasons.push(`Flow success rate ${successRate}% is below the ${threshold}% threshold for ${target}.`);
    }
    if ((summary?.failed || 0) > (target === 'default' ? 0 : 2)) {
      reasons.push('Flow still has too many recent failures.');
    }

    return {
      allowed: reasons.length === 0,
      score: successRate,
      reasons,
      releaseGateStatus: releaseGate.status,
      releaseGateScore: releaseGate.overallScore,
      sandboxCritical: sandboxLab.summary.critical || 0,
    };
  }

  static async promote(tenantId: string, resource: PromotionResource, resourceId: string, target: PromotionTarget, promotedBy: string) {
    const evaluation = resource === 'preset'
      ? await this.evaluatePresetPromotion(tenantId, resourceId, target)
      : await this.evaluateFlowPromotion(tenantId, resourceId, target);

    if (!evaluation.allowed) {
      return { ok: false, evaluation };
    }

    const snapshot = await ReleaseGateService.recordSnapshot(tenantId);
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

    const registry = this.normalizeRegistry(tenant.settings);
    const bucket = resource === 'preset' ? registry.presets : registry.flows;
    bucket[resourceId] = {
      state: target,
      promotedAt: new Date().toISOString(),
      promotedBy,
      gateSnapshotId: snapshot.id,
      score: evaluation.score,
    };

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...((tenant.settings as any) || {}),
          promotionRegistry: registry,
        } as any
      }
    });

    return { ok: true, evaluation, snapshot, record: bucket[resourceId] };
  }

  static async clearPromotion(tenantId: string, resource: PromotionResource, resourceId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

    const registry = this.normalizeRegistry(tenant.settings);
    if (resource === 'preset') {
      delete registry.presets[resourceId];
    } else {
      delete registry.flows[resourceId];
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...((tenant.settings as any) || {}),
          promotionRegistry: registry,
        } as any
      }
    });
  }
}
