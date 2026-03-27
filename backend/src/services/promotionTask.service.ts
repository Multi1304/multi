import crypto from 'crypto';
import { prisma } from '../prisma';
import { PromotionGateService } from './promotionGate.service';

type PromotionResource = 'preset' | 'flow';
type PromotionAction = 'promote_recommended' | 'promote_default' | 'review_current';
type PromotionTaskStatus = 'pending_review' | 'pending_approval' | 'applied' | 'blocked' | 'resolved' | 'dismissed';

interface PromotionApprovalEntry {
  at: string;
  by: string;
  action: 'queued' | 'approved' | 'blocked' | 'resolved' | 'dismissed';
  note?: string | null;
}

export interface PromotionTask {
  id: string;
  resource: PromotionResource;
  resourceId: string;
  resourceName: string;
  action: PromotionAction;
  status: PromotionTaskStatus;
  createdAt: string;
  createdBy: string;
  requiredRole?: 'MANAGER' | 'ADMIN' | null;
  reasons: string[];
  score: number;
  targetState?: 'recommended' | 'default' | null;
  appliedAt?: string | null;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  note?: string | null;
  approvalHistory?: PromotionApprovalEntry[];
}

interface PromotionTaskRegistry {
  tasks: PromotionTask[];
}

export class PromotionTaskService {
  private static normalizeRegistry(settings?: any): PromotionTaskRegistry {
    const raw = settings?.promotionTasks;
    return {
      tasks: Array.isArray(raw?.tasks) ? raw.tasks : [],
    };
  }

  private static async loadTenant(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
    return tenant;
  }

  private static async saveRegistry(tenantId: string, tenantSettings: any, registry: PromotionTaskRegistry) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...(tenantSettings || {}),
          promotionTasks: {
            tasks: registry.tasks.slice(0, 50),
          },
        } as any,
      },
    });
  }

  static async list(tenantId: string) {
    const tenant = await this.loadTenant(tenantId);
    const registry = this.normalizeRegistry(tenant.settings);
    return registry.tasks.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  static summarize(tasks: PromotionTask[]) {
    const pendingApproval = tasks.filter((task) => task.status === 'pending_approval');
    const pendingReview = tasks.filter((task) => task.status === 'pending_review');
    const blocked = tasks.filter((task) => task.status === 'blocked');
    return {
      total: tasks.length,
      pendingApproval: pendingApproval.length,
      pendingReview: pendingReview.length,
      blocked: blocked.length,
      critical: blocked.length + pendingApproval.filter((task) => task.targetState === 'default').length,
      topPending: pendingApproval.slice(0, 5),
      topBlocked: blocked.slice(0, 5),
    };
  }

  static filterForRole(tasks: PromotionTask[], role?: string) {
    if (!role) return [];
    return tasks.filter((task) => {
      if (task.status !== 'pending_approval') return false;
      if (role === 'ADMIN') return true;
      return task.requiredRole === role;
    });
  }

  static async applyRecommendation(input: {
    tenantId: string;
    userId: string;
    resource: PromotionResource;
    resourceId: string;
    resourceName: string;
    action: PromotionAction;
    reasons?: string[];
    score?: number;
  }) {
    const tenant = await this.loadTenant(input.tenantId);
    const registry = this.normalizeRegistry(tenant.settings);

    const now = new Date().toISOString();
    const baseTask: PromotionTask = {
      id: crypto.randomUUID(),
      resource: input.resource,
      resourceId: input.resourceId,
      resourceName: input.resourceName,
      action: input.action,
      status: 'pending_review',
      createdAt: now,
      createdBy: input.userId,
      requiredRole: input.action === 'promote_default' ? 'ADMIN' : input.action === 'promote_recommended' ? 'MANAGER' : null,
      reasons: input.reasons || [],
      score: Number(input.score || 0),
      targetState: input.action === 'promote_default' ? 'default' : input.action === 'promote_recommended' ? 'recommended' : null,
      appliedAt: null,
      resolvedAt: null,
      resolvedBy: null,
      note: null,
      approvalHistory: [{ at: now, by: input.userId, action: 'queued', note: null }],
    };

    if (input.action === 'review_current') {
      registry.tasks.unshift(baseTask);
      await this.saveRegistry(input.tenantId, tenant.settings, registry);
      return baseTask;
    }

    const task: PromotionTask = {
      ...baseTask,
      status: 'pending_approval',
      note: `Queued for ${baseTask.requiredRole} approval.`,
    };

    registry.tasks.unshift(task);
    await this.saveRegistry(input.tenantId, tenant.settings, registry);
    return task;
  }

  static async approveTask(tenantId: string, taskId: string, userId: string, approverRole: string, note?: string | null) {
    const tenant = await this.loadTenant(tenantId);
    const registry = this.normalizeRegistry(tenant.settings);
    const task = registry.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error(`Promotion task ${taskId} not found`);
    if (task.status !== 'pending_approval') {
      throw new Error(`Promotion task ${taskId} is not pending approval`);
    }
    if (task.requiredRole === 'ADMIN' && approverRole !== 'ADMIN') {
      throw new Error('Only admins can approve this promotion');
    }
    if (task.requiredRole === 'MANAGER' && !['ADMIN', 'MANAGER'].includes(approverRole)) {
      throw new Error('Only managers or admins can approve this promotion');
    }

    const target = task.targetState === 'default' ? 'default' : 'recommended';
    const result = await PromotionGateService.promote(tenantId, task.resource, task.resourceId, target, userId);
    const now = new Date().toISOString();

    task.status = result.ok ? 'applied' : 'blocked';
    task.appliedAt = result.ok ? now : null;
    task.resolvedAt = result.ok ? now : null;
    task.resolvedBy = userId;
    task.note = result.ok
      ? (note || `Approved and applied as ${target}.`)
      : (result.evaluation?.reasons?.[0] || 'Approval failed because release gates blocked promotion.');
    task.reasons = result.ok ? task.reasons : (result.evaluation?.reasons || task.reasons);
    task.score = result.evaluation?.score ?? task.score;
    task.approvalHistory = [
      ...(task.approvalHistory || []),
      {
        at: now,
        by: userId,
        action: result.ok ? 'approved' : 'blocked',
        note: note || null,
      },
    ];

    await this.saveRegistry(tenantId, tenant.settings, registry);
    return task;
  }

  static async resolveTask(tenantId: string, taskId: string, userId: string, resolution: 'resolved' | 'dismissed', note?: string | null) {
    const tenant = await this.loadTenant(tenantId);
    const registry = this.normalizeRegistry(tenant.settings);
    const task = registry.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error(`Promotion task ${taskId} not found`);

    task.status = resolution;
    task.resolvedAt = new Date().toISOString();
    task.resolvedBy = userId;
    task.note = note || task.note || null;
    task.approvalHistory = [
      ...(task.approvalHistory || []),
      {
        at: task.resolvedAt,
        by: userId,
        action: resolution,
        note: note || null,
      },
    ];

    await this.saveRegistry(tenantId, tenant.settings, registry);
    return task;
  }
}
