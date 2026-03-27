import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, logAuditMock } = vi.hoisted(() => ({
  prismaMock: {
    tenant: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  logAuditMock: vi.fn(),
}));

vi.mock('../src/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('../src/services/securityPostureReport.service', () => ({
  SecurityPostureReportService: {
    build: vi.fn(),
  },
}));

vi.mock('../src/services/audit.service', () => ({
  logAudit: logAuditMock,
}));

import { SecurityGuardrailService } from '../src/services/securityGuardrail.service';
import { SecurityPostureReportService } from '../src/services/securityPostureReport.service';

describe('security posture guardrails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.tenant.findUnique.mockResolvedValue({
      settings: {
        securityPolicy: {},
        runtimePolicy: {},
        incidentCenter: {
          notifications: {
            enabled: true,
            notifyWarnings: false,
          },
        },
      },
    });
    prismaMock.tenant.update.mockResolvedValue({});
  });

  it('applies silent guardrails for remote exposure and honey activity', async () => {
    (SecurityPostureReportService.build as any).mockResolvedValue({
      status: 'critical',
      posture: {
        remoteExposureDetected: true,
        requireSensitiveMfa: false,
      },
      honeySummary: {
        count: 2,
      },
      auditIntegrity: {
        broken: 0,
      },
    });

    const result = await SecurityGuardrailService.evaluateAndApply('tenant-1', 'user-1');

    expect(result.actions.some((item: any) => item.code === 'enforce_sensitive_mfa' && item.status === 'applied')).toBe(true);
    expect(result.actions.some((item: any) => item.code === 'enable_enhanced_monitoring' && item.status === 'applied')).toBe(true);
    expect(prismaMock.tenant.update).toHaveBeenCalled();
    expect(logAuditMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'security.guardrails_applied',
    }));
  });

  it('switches runtime safe mode on when audit integrity is degraded', async () => {
    (SecurityPostureReportService.build as any).mockResolvedValue({
      status: 'critical',
      posture: {
        remoteExposureDetected: false,
        requireSensitiveMfa: true,
      },
      honeySummary: {
        count: 0,
      },
      auditIntegrity: {
        broken: 3,
      },
    });

    const result = await SecurityGuardrailService.evaluateAndApply('tenant-1', 'user-2');

    expect(result.actions.some((item: any) => item.code === 'enable_runtime_safe_mode' && item.status === 'applied')).toBe(true);
    expect(prismaMock.tenant.update).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        settings: expect.objectContaining({
          runtimePolicy: expect.objectContaining({
            safeMode: true,
          }),
        }),
      },
    }));
  });

  it('respects autoApplyGuardrails=false and skips silent changes', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({
      settings: {
        securityPolicy: {
          autoApplyGuardrails: false,
        },
        runtimePolicy: {},
        incidentCenter: {
          notifications: {
            enabled: true,
            notifyWarnings: false,
          },
        },
      },
    });

    (SecurityPostureReportService.build as any).mockResolvedValue({
      status: 'critical',
      posture: {
        remoteExposureDetected: true,
        requireSensitiveMfa: false,
      },
      honeySummary: {
        count: 2,
      },
      auditIntegrity: {
        broken: 4,
      },
    });

    const result = await SecurityGuardrailService.evaluateAndApply('tenant-1', 'user-3');

    expect(result.actions[0].code).toBe('guardrails_disabled');
    expect(prismaMock.tenant.update).not.toHaveBeenCalled();
  });
});
