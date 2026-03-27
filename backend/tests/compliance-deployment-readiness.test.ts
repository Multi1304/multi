import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, accessMock, readFileMock } = vi.hoisted(() => ({
  prismaMock: {
    user: {
      count: vi.fn(),
    },
  },
  accessMock: vi.fn(),
  readFileMock: vi.fn(),
}));

vi.mock('../src/prisma', () => ({
  prisma: prismaMock,
}));

vi.mock('fs/promises', () => ({
  default: {
    access: accessMock,
    readFile: readFileMock,
  },
}));

vi.mock('../src/services/securityPosture.service', () => ({
  SecurityPostureService: {
    getSnapshot: vi.fn(),
  },
}));

vi.mock('../src/services/auditIntegrity.service', () => ({
  AuditIntegrityService: {
    verifyTenant: vi.fn(),
  },
}));

vi.mock('../src/services/securityPolicy.service', () => ({
  SecurityPolicyService: {
    getPolicy: vi.fn(),
  },
}));

vi.mock('../src/services/destructiveAction.service', () => ({
  DestructiveActionService: {
    list: vi.fn(),
  },
}));

vi.mock('../src/services/canaryTrap.service', () => ({
  CanaryTrapService: {
    listHoneyEvents: vi.fn(),
  },
}));

import { ComplianceReportService } from '../src/services/complianceReport.service';
import { DeploymentReadinessService } from '../src/services/deploymentReadiness.service';
import { SecurityPostureService } from '../src/services/securityPosture.service';
import { AuditIntegrityService } from '../src/services/auditIntegrity.service';
import { SecurityPolicyService } from '../src/services/securityPolicy.service';
import { DestructiveActionService } from '../src/services/destructiveAction.service';
import { CanaryTrapService } from '../src/services/canaryTrap.service';

describe('compliance and deployment readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.user.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);

    (SecurityPostureService.getSnapshot as any).mockResolvedValue({
      remoteExposureDetected: true,
      adminAllowlistConfigured: false,
      requireSensitiveMfa: false,
      apiKeys: {
        total: 3,
        expiringSoon: 1,
        staleKeys: 1,
      },
      summary: 'Admin IP fence is missing.',
    });

    (AuditIntegrityService.verifyTenant as any).mockResolvedValue({
      valid: 9,
      total: 10,
      broken: 1,
    });

    (SecurityPolicyService.getPolicy as any).mockResolvedValue({
      requireSensitiveMfa: false,
      enhancedMonitoring: true,
      autoApplyGuardrails: true,
      reportSchedule: {
        enabled: true,
        intervalHours: 24,
        retainSnapshots: 14,
        autoExport: false,
      },
      rolePolicies: {
        ADMIN: {
          exportReports: true,
          rotateSecrets: true,
          executeDestructiveActions: true,
          manageSecurityPolicy: true,
        },
        MANAGER: {
          exportReports: true,
          rotateSecrets: true,
          executeDestructiveActions: true,
          manageSecurityPolicy: false,
        },
        AUDITOR: {
          exportReports: true,
          rotateSecrets: false,
          executeDestructiveActions: false,
          manageSecurityPolicy: false,
        },
        OPERATOR: {
          exportReports: false,
          rotateSecrets: false,
          executeDestructiveActions: false,
          manageSecurityPolicy: false,
        },
      },
    });

    (DestructiveActionService.list as any).mockResolvedValue([
      { status: 'pending' },
      { status: 'executed' },
    ]);

    (CanaryTrapService.listHoneyEvents as any).mockResolvedValue([
      { trapId: 'honey', trippedAt: new Date().toISOString() },
    ]);

    accessMock.mockImplementation(async (candidate: string) => {
      if (String(candidate).includes('docker-compose.prod.yml') || String(candidate).includes('Caddyfile.production')) {
        return;
      }
      throw new Error('missing');
    });

    readFileMock.mockImplementation(async (candidate: string) => {
      if (String(candidate).includes('docker-compose.prod.yml')) {
        return 'services:\n  caddy:\n    image: caddy';
      }
      return '';
    });
  });

  it('builds a compliance report with blockers and recommendations', async () => {
    const report = await ComplianceReportService.build('tenant-1');

    expect(report.status).toBe('non_compliant');
    expect(report.blockers).toContain('Admin IP Allowlist');
    expect(report.controls.some((item) => item.key === 'audit_integrity' && item.status === 'fail')).toBe(true);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it('builds a deployment readiness report with blockers when exposure controls are missing', async () => {
    const report = await DeploymentReadinessService.build('tenant-1');

    expect(report.status).toBe('blocked');
    expect(report.blockers).toContain('Admin Surface Fence');
    expect(report.checks.some((item) => item.key === 'reverse_proxy' && item.status === 'pass')).toBe(true);
  });
});
