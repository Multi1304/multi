import { describe, expect, it, vi } from 'vitest';
import { PromotionTaskService } from '../src/services/promotionTask.service';
import { PromotionGateService } from '../src/services/promotionGate.service';
import { prisma } from '../src/prisma';

vi.mock('../src/prisma', () => ({
  prisma: {
    tenant: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  }
}));

describe('promotion task service', () => {
  it('creates pending review tasks without applying promotion', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue({ settings: {} });
    (prisma.tenant.update as any).mockResolvedValue({});

    const task = await PromotionTaskService.applyRecommendation({
      tenantId: 'tenant',
      userId: 'user',
      resource: 'flow',
      resourceId: 'flow-1',
      resourceName: 'Flow 1',
      action: 'review_current',
      reasons: ['Review needed'],
      score: 42,
    });

    expect(task.status).toBe('pending_review');
    expect(task.action).toBe('review_current');
  });

  it('queues promotion tasks for approval before applying them', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue({ settings: {} });
    (prisma.tenant.update as any).mockResolvedValue({});

    const task = await PromotionTaskService.applyRecommendation({
      tenantId: 'tenant',
      userId: 'user',
      resource: 'preset',
      resourceId: 'preset-1',
      resourceName: 'Preset 1',
      action: 'promote_recommended',
      reasons: ['Healthy preset'],
      score: 91,
    });

    expect(task.status).toBe('pending_approval');
    expect(task.targetState).toBe('recommended');
  });

  it('approves queued tasks and applies the promotion', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue({
      settings: {
        promotionTasks: {
          tasks: [{
            id: 'task-1',
            resource: 'preset',
            resourceId: 'preset-1',
            resourceName: 'Preset 1',
            action: 'promote_recommended',
            status: 'pending_approval',
            createdAt: new Date().toISOString(),
            createdBy: 'user',
            requiredRole: 'MANAGER',
            reasons: ['Healthy preset'],
            score: 91,
            targetState: 'recommended',
            approvalHistory: [],
          }]
        }
      }
    });
    (prisma.tenant.update as any).mockResolvedValue({});
    vi.spyOn(PromotionGateService, 'promote').mockResolvedValue({
      ok: true,
      evaluation: { score: 91 },
    } as any);

    const task = await PromotionTaskService.approveTask('tenant', 'task-1', 'manager-user', 'MANAGER');
    expect(task.status).toBe('applied');
    expect(task.resolvedBy).toBe('manager-user');
  });
});
