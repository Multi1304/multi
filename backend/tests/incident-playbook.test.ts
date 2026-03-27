import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IncidentPlaybookService } from '../src/services/incidentPlaybook.service';
import { IncidentCenterService } from '../src/services/incidentCenter.service';
import { ReleaseGateService } from '../src/services/releaseGate.service';
import { prisma } from '../src/prisma';

vi.mock('../src/prisma', () => ({
  prisma: {
    tenant: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('incident playbook service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds playbooks with automated actions', () => {
    const playbook = IncidentPlaybookService.build({
      id: 'incident-1',
      code: 'memory_admission_blocked',
      title: 'Memory admission blocked',
      severity: 'critical',
      status: 'open',
      source: 'memory',
      summary: 'Blocked at 1024MB',
      evidence: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    expect(playbook.automatedActions.some((item) => item.id === 'enable_safe_runtime_mode')).toBe(true);
  });

  it('applies safe runtime mode remediation', async () => {
    vi.spyOn(IncidentCenterService, 'loadRegistry').mockResolvedValue({
      tenantSettings: {},
      registry: {
        items: [{
          id: 'incident-1',
          code: 'queue_pressure',
          title: 'Queue pressure',
          severity: 'warning',
          status: 'open',
          source: 'queue',
          summary: 'Queue waiting high',
          evidence: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }],
      },
    } as any);
    vi.spyOn(IncidentCenterService, 'appendRemediation').mockResolvedValue({} as any);
    (prisma.tenant.update as any).mockResolvedValue({});

    const result = await IncidentPlaybookService.applyAction('tenant-1', 'incident-1', 'user-1', 'enable_safe_runtime_mode');
    expect(result.ok).toBe(true);
    expect(prisma.tenant.update).toHaveBeenCalled();
  });

  it('records release gate snapshots from playbook actions', async () => {
    vi.spyOn(IncidentCenterService, 'loadRegistry').mockResolvedValue({
      tenantSettings: {},
      registry: {
        items: [{
          id: 'incident-2',
          code: 'release_gate_failed',
          title: 'Release gates failing',
          severity: 'critical',
          status: 'open',
          source: 'release_gates',
          summary: 'Gate failed',
          evidence: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }],
      },
    } as any);
    vi.spyOn(IncidentCenterService, 'appendRemediation').mockResolvedValue({} as any);
    vi.spyOn(ReleaseGateService, 'recordSnapshot').mockResolvedValue({} as any);

    const result = await IncidentPlaybookService.applyAction('tenant-1', 'incident-2', 'user-1', 'record_release_snapshot');
    expect(result.ok).toBe(true);
    expect(ReleaseGateService.recordSnapshot).toHaveBeenCalled();
  });
});
