import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/prisma';
import { IncidentRemediationTaskService } from '../src/services/incidentRemediationTask.service';
import { IncidentPlaybookService } from '../src/services/incidentPlaybook.service';
import { IncidentCenterService } from '../src/services/incidentCenter.service';

vi.mock('../src/prisma', () => ({
  prisma: {
    tenant: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('incident remediation task service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queues sensitive remediation tasks for approval', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue({ settings: {} });
    (prisma.tenant.update as any).mockResolvedValue({});
    vi.spyOn(IncidentCenterService, 'appendRemediation').mockResolvedValue({} as any);

    const task = await IncidentRemediationTaskService.queueTask({
      tenantId: 'tenant-1',
      userId: 'operator-1',
      incident: {
        id: 'incident-1',
        code: 'release_gate_failed',
        title: 'Release gates failing',
        severity: 'critical',
        status: 'open',
        source: 'release_gates',
        summary: 'Overall score is low',
        evidence: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as any,
      action: {
        id: 'enable_safe_runtime_mode',
        label: 'Enable Safe Runtime',
        detail: 'Reduce aggressiveness',
        automated: true,
        requiresApprovalRole: 'MANAGER',
      },
    });

    expect(task.status).toBe('pending_approval');
    expect(task.requiredRole).toBe('MANAGER');
    expect(IncidentCenterService.appendRemediation).toHaveBeenCalledWith(
      'tenant-1',
      'incident-1',
      expect.objectContaining({ result: 'queued' })
    );
  });

  it('approves queued remediation tasks and applies the action', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue({
      settings: {
        incidentCenter: {
          remediationTasks: {
            tasks: [{
              id: 'task-1',
              incidentId: 'incident-1',
              incidentCode: 'queue_pressure',
              incidentTitle: 'Queue pressure',
              incidentSeverity: 'warning',
              actionId: 'enable_safe_runtime_mode',
              actionLabel: 'Enable Safe Runtime',
              actionDetail: 'Reduce runtime pressure',
              status: 'pending_approval',
              requiredRole: 'MANAGER',
              createdAt: new Date().toISOString(),
              createdBy: 'operator-1',
              approvalHistory: [],
            }],
          },
        },
      },
    });
    (prisma.tenant.update as any).mockResolvedValue({});
    vi.spyOn(IncidentPlaybookService, 'applyAction').mockResolvedValue({
      ok: true,
      actionId: 'enable_safe_runtime_mode',
      note: 'Safe runtime mode enabled.',
    });

    const task = await IncidentRemediationTaskService.approveTask('tenant-1', 'task-1', 'manager-1', 'MANAGER');
    expect(task.status).toBe('applied');
    expect(task.resolvedBy).toBe('manager-1');
  });
});
