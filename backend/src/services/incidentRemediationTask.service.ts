import crypto from 'crypto';
import { prisma } from '../prisma';
import { IncidentCenterService, IncidentRecord } from './incidentCenter.service';
import { IncidentPlaybookAction, IncidentPlaybookService } from './incidentPlaybook.service';

type RemediationTaskStatus = 'pending_approval' | 'applied' | 'blocked' | 'resolved' | 'dismissed';

interface RemediationApprovalEntry {
  at: string;
  by: string;
  action: 'queued' | 'approved' | 'blocked' | 'resolved' | 'dismissed';
  note?: string | null;
}

export interface IncidentRemediationTask {
  id: string;
  incidentId: string;
  incidentCode: string;
  incidentTitle: string;
  incidentSeverity: IncidentRecord['severity'];
  actionId: string;
  actionLabel: string;
  actionDetail: string;
  status: RemediationTaskStatus;
  requiredRole?: 'MANAGER' | 'ADMIN' | null;
  createdAt: string;
  createdBy: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  note?: string | null;
  approvalHistory?: RemediationApprovalEntry[];
}

interface IncidentRemediationRegistry {
  tasks: IncidentRemediationTask[];
}

export class IncidentRemediationTaskService {
  private static normalizeRegistry(settings?: any): IncidentRemediationRegistry {
    const raw = settings?.incidentCenter?.remediationTasks;
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

  private static async saveRegistry(tenantId: string, tenantSettings: any, registry: IncidentRemediationRegistry) {
    const incidentCenter = tenantSettings?.incidentCenter && typeof tenantSettings.incidentCenter === 'object'
      ? tenantSettings.incidentCenter
      : {};
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...(tenantSettings || {}),
          incidentCenter: {
            ...incidentCenter,
            remediationTasks: {
              tasks: registry.tasks.slice(0, 50),
            },
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

  static summarize(tasks: IncidentRemediationTask[]) {
    const pendingApproval = tasks.filter((task) => task.status === 'pending_approval');
    const blocked = tasks.filter((task) => task.status === 'blocked');
    return {
      total: tasks.length,
      pendingApproval: pendingApproval.length,
      blocked: blocked.length,
      critical: pendingApproval.filter((task) => task.incidentSeverity === 'critical').length + blocked.length,
      topPending: pendingApproval.slice(0, 5),
      topBlocked: blocked.slice(0, 5),
    };
  }

  static filterForRole(tasks: IncidentRemediationTask[], role?: string) {
    if (!role) return [];
    return tasks.filter((task) => {
      if (task.status !== 'pending_approval') return false;
      if (role === 'ADMIN') return true;
      return task.requiredRole === role;
    });
  }

  static async queueTask(input: {
    tenantId: string;
    userId: string;
    incident: IncidentRecord;
    action: IncidentPlaybookAction;
  }) {
    const tenant = await this.loadTenant(input.tenantId);
    const registry = this.normalizeRegistry(tenant.settings);
    const now = new Date().toISOString();

    const existing = registry.tasks.find((task) =>
      task.incidentId === input.incident.id &&
      task.actionId === input.action.id &&
      task.status === 'pending_approval'
    );
    if (existing) {
      return existing;
    }

    const task: IncidentRemediationTask = {
      id: crypto.randomUUID(),
      incidentId: input.incident.id,
      incidentCode: input.incident.code,
      incidentTitle: input.incident.title,
      incidentSeverity: input.incident.severity,
      actionId: input.action.id,
      actionLabel: input.action.label,
      actionDetail: input.action.detail,
      status: 'pending_approval',
      requiredRole: input.action.requiresApprovalRole || 'MANAGER',
      createdAt: now,
      createdBy: input.userId,
      resolvedAt: null,
      resolvedBy: null,
      note: `Queued for ${input.action.requiresApprovalRole || 'MANAGER'} approval.`,
      approvalHistory: [{ at: now, by: input.userId, action: 'queued', note: null }],
    };

    registry.tasks.unshift(task);
    await this.saveRegistry(input.tenantId, tenant.settings, registry);
    await IncidentCenterService.appendRemediation(input.tenantId, input.incident.id, {
      by: input.userId,
      action: input.action.id,
      result: 'queued',
      note: task.note,
    });
    return task;
  }

  static async approveTask(tenantId: string, taskId: string, userId: string, approverRole: string, note?: string | null) {
    const tenant = await this.loadTenant(tenantId);
    const registry = this.normalizeRegistry(tenant.settings);
    const task = registry.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error(`Incident remediation task ${taskId} not found`);
    if (task.status !== 'pending_approval') {
      throw new Error(`Incident remediation task ${taskId} is not pending approval`);
    }
    if (task.requiredRole === 'ADMIN' && approverRole !== 'ADMIN') {
      throw new Error('Only admins can approve this remediation');
    }
    if (task.requiredRole === 'MANAGER' && !['ADMIN', 'MANAGER'].includes(approverRole)) {
      throw new Error('Only managers or admins can approve this remediation');
    }

    const result = await IncidentPlaybookService.applyAction(tenantId, task.incidentId, userId, task.actionId);
    const now = new Date().toISOString();
    task.status = result.ok ? 'applied' : 'blocked';
    task.resolvedAt = result.ok ? now : null;
    task.resolvedBy = userId;
    task.note = result.ok ? (note || result.note) : (note || 'Approval failed while applying remediation.');
    task.approvalHistory = [
      ...(task.approvalHistory || []),
      {
        at: now,
        by: userId,
        action: result.ok ? 'approved' : 'blocked',
        note: note || result.note || null,
      },
    ];

    await this.saveRegistry(tenantId, tenant.settings, registry);
    return task;
  }

  static async resolveTask(
    tenantId: string,
    taskId: string,
    userId: string,
    resolution: 'resolved' | 'dismissed',
    note?: string | null
  ) {
    const tenant = await this.loadTenant(tenantId);
    const registry = this.normalizeRegistry(tenant.settings);
    const task = registry.tasks.find((item) => item.id === taskId);
    if (!task) throw new Error(`Incident remediation task ${taskId} not found`);

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
