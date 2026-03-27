import { prisma } from '../prisma';
import { SecurityPostureReportService } from './securityPostureReport.service';
import { logAudit } from './audit.service';

type GuardrailAction = {
  code: string;
  status: 'applied' | 'already_active' | 'skipped';
  note: string;
};

export class SecurityGuardrailService {
  static async evaluateAndApply(tenantId: string, actorUserId = 'system') {
    const report = await SecurityPostureReportService.build(tenantId);
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    const settings = tenant.settings && typeof tenant.settings === 'object'
      ? { ...(tenant.settings as Record<string, any>) }
      : {};
    const securityPolicy = settings.securityPolicy && typeof settings.securityPolicy === 'object'
      ? { ...(settings.securityPolicy as Record<string, any>) }
      : {};
    const runtimePolicy = settings.runtimePolicy && typeof settings.runtimePolicy === 'object'
      ? { ...(settings.runtimePolicy as Record<string, any>) }
      : {};
    const incidentCenter = settings.incidentCenter && typeof settings.incidentCenter === 'object'
      ? { ...(settings.incidentCenter as Record<string, any>) }
      : {};
    const notifications = incidentCenter.notifications && typeof incidentCenter.notifications === 'object'
      ? { ...(incidentCenter.notifications as Record<string, any>) }
      : {};
    const autoApplyGuardrails = securityPolicy.autoApplyGuardrails !== false;

    const actions: GuardrailAction[] = [];
    let changed = false;

    if (!autoApplyGuardrails) {
      return {
        report,
        actions: [
          {
            code: 'guardrails_disabled',
            status: 'skipped',
            note: 'Automatic guardrails are disabled by tenant policy.',
          },
        ],
      };
    }

    if (report.posture.remoteExposureDetected && !report.posture.requireSensitiveMfa) {
      if (securityPolicy.requireSensitiveMfa) {
        actions.push({
          code: 'enforce_sensitive_mfa',
          status: 'already_active',
          note: 'Sensitive MFA was already enforced in tenant policy.',
        });
      } else {
        securityPolicy.requireSensitiveMfa = true;
        securityPolicy.lastUpdatedAt = new Date().toISOString();
        securityPolicy.lastUpdatedBy = actorUserId;
        securityPolicy.source = 'security-guardrail';
        changed = true;
        actions.push({
          code: 'enforce_sensitive_mfa',
          status: 'applied',
          note: 'Sensitive MFA was enforced automatically because Camel is no longer localhost-only.',
        });
      }
    }

    if (report.honeySummary.count > 0) {
      if (securityPolicy.enhancedMonitoring) {
        actions.push({
          code: 'enable_enhanced_monitoring',
          status: 'already_active',
          note: 'Enhanced monitoring was already active.',
        });
      } else {
        securityPolicy.enhancedMonitoring = true;
        securityPolicy.enhancedMonitoringSince = new Date().toISOString();
        securityPolicy.enhancedMonitoringSource = 'security-guardrail';
        notifications.notifyWarnings = true;
        changed = true;
        actions.push({
          code: 'enable_enhanced_monitoring',
          status: 'applied',
          note: 'Enhanced monitoring was enabled automatically after honey/canary activity.',
        });
      }
    }

    if (report.auditIntegrity.broken > 0) {
      if (runtimePolicy.safeMode) {
        actions.push({
          code: 'enable_runtime_safe_mode',
          status: 'already_active',
          note: 'Runtime safe mode was already active while audit integrity is degraded.',
        });
      } else {
        runtimePolicy.safeMode = true;
        runtimePolicy.lastEnabledAt = new Date().toISOString();
        runtimePolicy.lastEnabledBy = actorUserId;
        runtimePolicy.source = 'security-guardrail';
        changed = true;
        actions.push({
          code: 'enable_runtime_safe_mode',
          status: 'applied',
          note: 'Runtime safe mode was enabled automatically because audit integrity degraded.',
        });
      }
    }

    if (!changed) {
      actions.push({
        code: 'guardrails_idle',
        status: 'skipped',
        note: 'No automatic guardrail changes were needed.',
      });
      return {
        report,
        actions,
      };
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...settings,
          securityPolicy,
          runtimePolicy,
          incidentCenter: {
            ...incidentCenter,
            notifications,
          },
        } as any,
      },
    });

    await logAudit({
      tenantId,
      userId: actorUserId,
      action: 'security.guardrails_applied',
      resource: 'security:guardrails',
      detail: {
        actions,
        postureStatus: report.status,
      },
    });

    return {
      report,
      actions,
    };
  }
}
