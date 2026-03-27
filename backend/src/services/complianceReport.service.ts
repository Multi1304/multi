import { prisma } from '../prisma';
import { SecurityPostureService } from './securityPosture.service';
import { AuditIntegrityService } from './auditIntegrity.service';
import { SecurityPolicyService } from './securityPolicy.service';
import { DestructiveActionService } from './destructiveAction.service';
import { CanaryTrapService } from './canaryTrap.service';

type ComplianceControlStatus = 'pass' | 'warn' | 'fail';

type ComplianceControl = {
  key: string;
  title: string;
  status: ComplianceControlStatus;
  evidence: string;
};

export class ComplianceReportService {
  static async build(tenantId: string) {
    const [posture, auditIntegrity, policy, pendingDestructive, honeyEvents, admins, mfaAdmins] = await Promise.all([
      SecurityPostureService.getSnapshot(tenantId),
      AuditIntegrityService.verifyTenant(tenantId),
      SecurityPolicyService.getPolicy(tenantId),
      DestructiveActionService.list(tenantId, 50),
      CanaryTrapService.listHoneyEvents(20),
      prisma.user.count({ where: { tenantId, role: 'ADMIN' } }),
      prisma.user.count({ where: { tenantId, role: 'ADMIN', mfaEnabled: true } }),
    ]);

    const pendingCount = pendingDestructive.filter((item) => item.status === 'pending').length;
    const controls: ComplianceControl[] = [
      {
        key: 'admin_mfa',
        title: 'Admin MFA Coverage',
        status: admins === 0 || admins === mfaAdmins ? 'pass' : mfaAdmins > 0 ? 'warn' : 'fail',
        evidence: `${mfaAdmins}/${admins} admin user(s) have MFA enabled.`,
      },
      {
        key: 'admin_ip_allowlist',
        title: 'Admin IP Allowlist',
        status: posture.adminAllowlistConfigured ? 'pass' : posture.remoteExposureDetected ? 'fail' : 'warn',
        evidence: posture.adminAllowlistConfigured
          ? 'Admin IP allowlist is configured.'
          : 'Admin IP allowlist is not configured.',
      },
      {
        key: 'sensitive_mfa',
        title: 'Sensitive MFA Enforcement',
        status: policy.requireSensitiveMfa ? 'pass' : posture.remoteExposureDetected ? 'fail' : 'warn',
        evidence: policy.requireSensitiveMfa
          ? 'Sensitive MFA is enforced by policy.'
          : 'Sensitive MFA is not yet enforced by policy.',
      },
      {
        key: 'audit_integrity',
        title: 'Audit Integrity',
        status: auditIntegrity.broken > 0 ? 'fail' : 'pass',
        evidence: `${auditIntegrity.valid}/${auditIntegrity.total} verified entries, ${auditIntegrity.broken} broken.`,
      },
      {
        key: 'destructive_delay',
        title: 'Destructive Action Delay',
        status: pendingCount > 0 ? 'pass' : 'warn',
        evidence: pendingCount > 0
          ? `${pendingCount} delayed destructive action(s) waiting for review.`
          : 'No delayed destructive actions currently pending.',
      },
      {
        key: 'posture_reports',
        title: 'Scheduled Posture Reports',
        status: policy.reportSchedule.enabled ? 'pass' : 'warn',
        evidence: policy.reportSchedule.enabled
          ? `Scheduled every ${policy.reportSchedule.intervalHours}h with retention ${policy.reportSchedule.retainSnapshots}.`
          : 'Scheduled posture reporting is disabled.',
      },
      {
        key: 'honey_monitoring',
        title: 'Honey/Canary Monitoring',
        status: honeyEvents.length > 0
          ? (policy.enhancedMonitoring ? 'pass' : 'warn')
          : 'pass',
        evidence: honeyEvents.length > 0
          ? `${honeyEvents.length} honey/canary signal(s) detected recently.`
          : 'No recent honey/canary signals.',
      },
    ];

    const score = Math.max(
      0,
      Math.round(
        (controls.reduce((sum, control) => {
          if (control.status === 'pass') return sum + 100;
          if (control.status === 'warn') return sum + 60;
          return sum + 20;
        }, 0) / (controls.length * 100)) * 100
      )
    );

    const blockers = controls.filter((control) => control.status === 'fail').map((control) => control.title);
    const recommendations = controls
      .filter((control) => control.status !== 'pass')
      .map((control) => `${control.title}: ${control.evidence}`)
      .slice(0, 6);

    return {
      tenantId,
      generatedAt: new Date().toISOString(),
      score,
      status: blockers.length > 0 ? 'non_compliant' : recommendations.length > 0 ? 'attention' : 'aligned',
      controls,
      blockers,
      recommendations,
    };
  }
}
