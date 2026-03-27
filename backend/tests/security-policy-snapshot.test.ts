import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    tenant: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../src/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('../src/services/securityPostureReport.service', () => ({
  SecurityPostureReportService: {
    build: vi.fn(),
  },
}));

vi.mock('../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { SecurityPolicyService } from '../src/services/securityPolicy.service';
import { SecurityPostureSnapshotService } from '../src/services/securityPostureSnapshot.service';
import { SecurityPostureSchedulerService } from '../src/services/securityPostureScheduler.service';
import { SecurityPostureReportService } from '../src/services/securityPostureReport.service';

describe('security policy and posture snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.tenant.findUnique.mockResolvedValue({
      settings: {},
    });
    prismaMock.tenant.findMany.mockResolvedValue([]);
    prismaMock.tenant.update.mockResolvedValue({});
    (SecurityPostureReportService.build as any).mockResolvedValue({
      status: 'needs_attention',
      generatedAt: '2026-03-20T10:00:00.000Z',
      priorities: ['Require MFA for remote exposure'],
      workspaceRecommendations: ['Admin IP fence is missing.'],
      delayedDestructiveSummary: {
        pending: 2,
      },
      honeySummary: {
        count: 1,
      },
      auditIntegrity: {
        broken: 3,
        exportSignature: 'sig_123',
      },
      posture: {
        remoteExposureDetected: true,
      },
    });
  });

  it('merges tenant policy with secure defaults', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({
      settings: {
        securityPolicy: {
          enhancedMonitoring: true,
          reportSchedule: {
            intervalHours: 12,
          },
          rolePolicies: {
            MANAGER: {
              manageSecurityPolicy: true,
            },
          },
        },
      },
    });

    const policy = await SecurityPolicyService.getPolicy('tenant-1');

    expect(policy.requireSensitiveMfa).toBe(false);
    expect(policy.enhancedMonitoring).toBe(true);
    expect(policy.reportSchedule.intervalHours).toBe(12);
    expect(policy.reportSchedule.retainSnapshots).toBe(14);
    expect(policy.rolePolicies.MANAGER.manageSecurityPolicy).toBe(true);
    expect(policy.rolePolicies.AUDITOR.rotateSecrets).toBe(false);
  });

  it('records posture snapshots and trims history to tenant retention', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({
      settings: {
        securityPolicy: {
          reportSchedule: {
            retainSnapshots: 3,
          },
        },
        securityPostureSnapshots: [
          { id: 'older-1' },
          { id: 'older-2' },
          { id: 'older-3' },
          { id: 'older-4' },
        ],
      },
    });

    const snapshot = await SecurityPostureSnapshotService.recordSnapshot('tenant-1', 'manual');

    expect(snapshot.status).toBe('needs_attention');
    expect(prismaMock.tenant.update).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        settings: expect.objectContaining({
          securityPostureSnapshots: expect.arrayContaining([
            expect.objectContaining({
              id: snapshot.id,
              status: 'needs_attention',
            }),
          ]),
        }),
      },
    }));

    const storedSnapshots = prismaMock.tenant.update.mock.calls[0][0].data.settings.securityPostureSnapshots;
    expect(storedSnapshots).toHaveLength(3);
  });

  it('scheduler records snapshots only for tenants with enabled schedules and due intervals', async () => {
    prismaMock.tenant.findMany.mockResolvedValue([
      {
        id: 'tenant-enabled',
        settings: {
          securityPolicy: {
            reportSchedule: {
              enabled: true,
              intervalHours: 1,
            },
          },
          securityPostureLastSnapshotAt: '2000-01-01T00:00:00.000Z',
        },
      },
      {
        id: 'tenant-disabled',
        settings: {
          securityPolicy: {
            reportSchedule: {
              enabled: false,
            },
          },
        },
      },
    ]);

    const recordSpy = vi.spyOn(SecurityPostureSnapshotService, 'recordSnapshot').mockResolvedValue({
      id: 'snapshot-1',
      generatedAt: '2026-03-20T10:00:00.000Z',
      reason: 'scheduled',
      status: 'stable',
      remoteExposureDetected: false,
      brokenAuditEntries: 0,
      honeyEvents: 0,
      pendingDestructiveActions: 0,
      priorities: [],
      summary: 'All good',
      exportSignature: 'sig',
    });

    await SecurityPostureSchedulerService.runPass();

    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy).toHaveBeenCalledWith('tenant-enabled', 'scheduled');
  });
});
