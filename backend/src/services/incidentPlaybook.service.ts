import { prisma } from '../prisma';
import { IncidentCenterService, IncidentRecord } from './incidentCenter.service';
import { ReleaseGateService } from './releaseGate.service';

export interface IncidentPlaybookAction {
  id: string;
  label: string;
  detail: string;
  automated: boolean;
  requiresApprovalRole?: 'MANAGER' | 'ADMIN' | null;
}

export interface IncidentPlaybook {
  headline: string;
  steps: string[];
  automatedActions: IncidentPlaybookAction[];
  nextBestAction: string;
}

export class IncidentPlaybookService {
  static build(incident: IncidentRecord): IncidentPlaybook {
    const commonActions: IncidentPlaybookAction[] = [
      {
        id: 'snooze_notifications_15m',
        label: 'Snooze Notifications',
        detail: 'Pause repeated notifications for this incident for 15 minutes.',
        automated: true,
      },
    ];

    const playbooks: Record<string, IncidentPlaybook> = {
      release_gate_failed: {
        headline: 'Stabilize release quality before promoting or running high-risk changes.',
        steps: [
          'Inspect failing gate items and identify the lowest-scoring control.',
          'Freeze new promotions while the gate is below threshold.',
          'Capture a fresh snapshot after adjustments to confirm recovery.',
        ],
        automatedActions: [
          {
            id: 'record_release_snapshot',
            label: 'Record Gate Snapshot',
            detail: 'Take an immediate release gate snapshot to lock the current evidence.',
            automated: true,
          },
          {
            id: 'enable_safe_runtime_mode',
            label: 'Enable Safe Runtime',
            detail: 'Reduce runtime aggressiveness while release quality is degraded.',
            automated: true,
            requiresApprovalRole: 'MANAGER',
          },
          ...commonActions,
        ],
        nextBestAction: 'Record a fresh snapshot and enable safe runtime mode.',
      },
      promotion_pressure: {
        headline: 'Reduce operational risk before new promotions are approved.',
        steps: [
          'Review blocked or pending approval tasks first.',
          'Compare the latest release gates against the current promoted state.',
          'Resolve or dismiss stale promotion tasks to clear the pipeline.',
        ],
        automatedActions: [
          {
            id: 'record_release_snapshot',
            label: 'Capture Promotion Baseline',
            detail: 'Capture a release gate snapshot before changing promotion state.',
            automated: true,
          },
          ...commonActions,
        ],
        nextBestAction: 'Capture a new baseline, then review blocked promotion tasks.',
      },
      memory_admission_blocked: {
        headline: 'Protect the host before admitting more browser workloads.',
        steps: [
          'Stop admitting new heavy jobs until memory headroom recovers.',
          'Inspect active profiles and close stalled contexts.',
          'Recheck RSS after applying safe runtime mode.',
        ],
        automatedActions: [
          {
            id: 'enable_safe_runtime_mode',
            label: 'Enable Safe Runtime',
            detail: 'Reduce runtime pressure and aggressive behavior to lower memory use.',
            automated: true,
            requiresApprovalRole: 'MANAGER',
          },
          ...commonActions,
        ],
        nextBestAction: 'Enable safe runtime mode and recheck admission headroom.',
      },
      sandbox_lab_critical: {
        headline: 'Confirm contract and selector stability before wider rollout.',
        steps: [
          'Inspect the lowest-scoring sandbox scenarios.',
          'Compare current snapshots against previous passing versions.',
          'Re-run the lab after fixing the broken contract or selector.',
        ],
        automatedActions: [
          {
            id: 'record_release_snapshot',
            label: 'Capture Lab Baseline',
            detail: 'Record a release snapshot to preserve the failing state for comparison.',
            automated: true,
          },
          ...commonActions,
        ],
        nextBestAction: 'Capture the current failing state, then compare sandbox snapshots.',
      },
      queue_pressure: {
        headline: 'Reduce queue backlog before failures cascade into worker instability.',
        steps: [
          'Inspect waiting and failed jobs to identify hotspots.',
          'Reduce new workload pressure until the queue returns to a safe range.',
          'Track whether retries are worsening backlog rather than helping.',
        ],
        automatedActions: [
          {
            id: 'enable_safe_runtime_mode',
            label: 'Throttle Runtime',
            detail: 'Switch to a safer runtime mode to reduce new queue pressure.',
            automated: true,
            requiresApprovalRole: 'MANAGER',
          },
          ...commonActions,
        ],
        nextBestAction: 'Throttle runtime pressure and review failed jobs before scaling up again.',
      },
      runtime_hardening_degraded: {
        headline: 'Restore runtime safety before reliability regresses further.',
        steps: [
          'Inspect the top runtime recommendation and verify the affected subsystem.',
          'Reduce aggressive automation policies while the runtime is degraded.',
          'Take a fresh release snapshot after hardening changes.',
        ],
        automatedActions: [
          {
            id: 'enable_safe_runtime_mode',
            label: 'Enable Safe Runtime',
            detail: 'Apply conservative runtime settings immediately.',
            automated: true,
            requiresApprovalRole: 'MANAGER',
          },
          {
            id: 'record_release_snapshot',
            label: 'Record Post-Hardening Snapshot',
            detail: 'Capture a release gate snapshot after the runtime change.',
            automated: true,
          },
          ...commonActions,
        ],
        nextBestAction: 'Apply safe runtime mode, then capture a new hardening snapshot.',
      },
      public_surface_without_allowlist: {
        headline: 'Camel is exposed beyond localhost without an admin IP fence.',
        steps: [
          'Restrict ingress to trusted addresses before continuing normal admin operations.',
          'Confirm reverse proxy and TLS are the only exposed edge surfaces.',
          'Keep sensitive routes closed until the allowlist is configured.',
        ],
        automatedActions: [
          {
            id: 'enforce_workspace_mfa',
            label: 'Enforce Sensitive MFA',
            detail: 'Require MFA for sensitive actions at workspace level immediately.',
            automated: true,
            requiresApprovalRole: 'ADMIN',
          },
          ...commonActions,
        ],
        nextBestAction: 'Configure the admin IP allowlist and enforce sensitive MFA.',
      },
      low_admin_mfa_coverage: {
        headline: 'Some admin accounts are still operating without MFA.',
        steps: [
          'Identify the remaining admin accounts without authenticator MFA.',
          'Enable sensitive MFA enforcement before widening remote access.',
          'Review whether any admin API keys need tighter expiry or rotation.',
        ],
        automatedActions: [
          {
            id: 'enforce_workspace_mfa',
            label: 'Enforce Sensitive MFA',
            detail: 'Require MFA for sensitive actions at workspace level.',
            automated: true,
            requiresApprovalRole: 'ADMIN',
          },
          ...commonActions,
        ],
        nextBestAction: 'Enable MFA for all admins and enforce it for sensitive actions.',
      },
    };

    return playbooks[incident.code] || {
      headline: 'Inspect the incident evidence and stabilize the affected subsystem.',
      steps: ['Review evidence.', 'Acknowledge the incident.', 'Validate recovery after mitigation.'],
      automatedActions: commonActions,
      nextBestAction: 'Review the evidence and acknowledge the incident.',
    };
  }

  static enrich<T extends IncidentRecord>(incident: T) {
    return {
      ...incident,
      playbook: this.build(incident),
    };
  }

  static getAction(incident: IncidentRecord, actionId: string) {
    const playbook = this.build(incident);
    return playbook.automatedActions.find((action) => action.id === actionId) || null;
  }

  static async applyAction(tenantId: string, incidentId: string, userId: string, actionId: string) {
    const { tenantSettings, registry } = await IncidentCenterService.loadRegistry(tenantId);
    const baseSettings = tenantSettings && typeof tenantSettings === 'object' ? tenantSettings as Record<string, any> : {};
    const incident = registry.items.find((item) => item.id === incidentId);
    if (!incident) throw new Error(`Incident ${incidentId} not found`);

    let note = '';

    if (actionId === 'record_release_snapshot') {
      await ReleaseGateService.recordSnapshot(tenantId, {
        releaseLabel: `incident-${incident.code}`,
        commitRef: `incident:${incident.id}`,
      });
      note = 'Release gate snapshot recorded from incident playbook.';
    } else if (actionId === 'enable_safe_runtime_mode') {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          settings: {
            ...baseSettings,
            runtimePolicy: {
              ...(baseSettings?.runtimePolicy || {}),
              safeMode: true,
              lastEnabledAt: new Date().toISOString(),
              lastEnabledBy: userId,
              source: 'incident-playbook',
            },
          } as any,
        },
      });
      note = 'Safe runtime mode enabled from incident playbook.';
    } else if (actionId === 'snooze_notifications_15m') {
      const until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          settings: {
            ...baseSettings,
            incidentCenter: {
              ...(baseSettings?.incidentCenter || {}),
              notifications: {
                ...((baseSettings?.incidentCenter?.notifications) || {}),
                snoozedUntilByCode: {
                  ...((baseSettings?.incidentCenter?.notifications?.snoozedUntilByCode) || {}),
                  [incident.code]: until,
                },
              },
            },
          } as any,
        },
      });
      note = `Notifications snoozed until ${until}.`;
    } else if (actionId === 'enforce_workspace_mfa') {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          settings: {
            ...baseSettings,
            securityPolicy: {
              ...(baseSettings?.securityPolicy || {}),
              requireSensitiveMfa: true,
              lastUpdatedAt: new Date().toISOString(),
              lastUpdatedBy: userId,
              source: 'incident-playbook',
            },
          } as any,
        },
      });
      note = 'Workspace sensitive MFA enforcement enabled from incident playbook.';
    } else {
      throw new Error(`Unknown remediation action ${actionId}`);
    }

    await IncidentCenterService.appendRemediation(tenantId, incidentId, {
      by: userId,
      action: actionId,
      result: 'applied',
      note,
    });

    return { ok: true, actionId, note };
  }
}
