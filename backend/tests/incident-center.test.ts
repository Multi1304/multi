import { describe, expect, it, vi, beforeEach } from 'vitest';
import { IncidentCenterService } from '../src/services/incidentCenter.service';
import { prisma } from '../src/prisma';

vi.mock('../src/prisma', () => ({
  prisma: {
    tenant: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('incident center service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates incidents from degraded signals', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue({ settings: {} });
    (prisma.tenant.update as any).mockResolvedValue({});

    const incidents = await IncidentCenterService.syncFromSignals('tenant-1', {
      releaseGates: {
        status: 'fail',
        overallScore: 42,
        items: [{ label: 'Flow Stability', status: 'fail' }],
      },
      promotionAlerts: { critical: 1, blocked: 2, pendingApproval: 3 },
      memoryAdmission: { admitted: false, rssMb: 2048, maxRssMb: 1024 },
      sandboxLab: { critical: 2, averageScore: 51 },
      queueDepth: { waiting: 31, failed: 7, active: 2 },
      runtimeHardening: { status: 'warning', overallScore: 61, recommendations: ['Reduce aggressive retries'] },
    });

    expect(incidents.some((item) => item.code === 'release_gate_failed')).toBe(true);
    expect(incidents.some((item) => item.code === 'memory_admission_blocked')).toBe(true);
    expect(incidents.some((item) => item.code === 'sandbox_lab_critical')).toBe(true);
  });

  it('acknowledges and resolves incidents', async () => {
    const incident = {
      id: 'incident-1',
      code: 'queue_pressure',
      title: 'Queue pressure rising',
      severity: 'warning',
      status: 'open',
      source: 'queue',
      summary: 'Queue waiting is high.',
      evidence: { waiting: 18 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    (prisma.tenant.findUnique as any).mockResolvedValue({
      settings: {
        incidentCenter: {
          items: [incident],
        },
      },
    });
    (prisma.tenant.update as any).mockResolvedValue({});

    const acknowledged = await IncidentCenterService.acknowledge('tenant-1', 'incident-1', 'user-1', 'Investigating');
    expect(acknowledged.status).toBe('acknowledged');
    expect(acknowledged.acknowledgedBy).toBe('user-1');

    (prisma.tenant.findUnique as any).mockResolvedValue({
      settings: {
        incidentCenter: {
          items: [acknowledged],
        },
      },
    });

    const resolved = await IncidentCenterService.resolve('tenant-1', 'incident-1', 'manager-1', 'Recovered');
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolvedBy).toBe('manager-1');
  });

  it('preserves incident notification settings when saving incident items', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue({
      settings: {
        incidentCenter: {
          items: [],
          notifications: {
            enabled: true,
            cooldownMinutes: 30,
          },
        },
      },
    });
    (prisma.tenant.update as any).mockResolvedValue({});

    await IncidentCenterService.syncFromSignals('tenant-1', {
      queueDepth: { waiting: 31, failed: 1, active: 2 },
    });

    expect(prisma.tenant.update).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        settings: expect.objectContaining({
          incidentCenter: expect.objectContaining({
            notifications: expect.objectContaining({
              enabled: true,
              cooldownMinutes: 30,
            }),
          }),
        }),
      },
    }));
  });
});
