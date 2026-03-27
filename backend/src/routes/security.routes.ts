import { Router } from 'express';
import { authMiddleware, AuthRequest, requireRole } from '../middleware/auth';
import { SecurityDashboardService } from '../services/security.dashboard.service';
import { logger } from '../utils/logger';
import { prisma } from '../prisma';
import { TotpService } from '../services/totp.service';
import { requireSensitiveMfa } from '../middleware/requireSensitiveMfa';
import { config } from '../config';
import { ipAllowlistGuard } from '../middleware/ipAllowlist';
import { requireElevatedTrust } from '../middleware/requireElevatedTrust';
import { StepUpAuthService } from '../services/stepUpAuth.service';
import { DestructiveActionService } from '../services/destructiveAction.service';
import { CanaryTrapService } from '../services/canaryTrap.service';
import { SecurityPostureReportService } from '../services/securityPostureReport.service';
import { SecurityGuardrailService } from '../services/securityGuardrail.service';
import { SecretRotationService } from '../services/secretRotation.service';
import { requireStepUp } from '../middleware/requireStepUp';
import { logAudit } from '../services/audit.service';
import { SecurityPolicyService } from '../services/securityPolicy.service';
import { SecurityPostureSnapshotService } from '../services/securityPostureSnapshot.service';
import { requireSecurityCapability } from '../middleware/requireSecurityCapability';
import { ComplianceReportService } from '../services/complianceReport.service';
import { DeploymentReadinessService } from '../services/deploymentReadiness.service';
import { z } from 'zod';

const router = Router();
router.use(authMiddleware);
router.use(ipAllowlistGuard('admin', 'Security API'));
router.use(requireElevatedTrust());

const rolePolicySchema = z.object({
  exportReports: z.boolean().optional(),
  rotateSecrets: z.boolean().optional(),
  executeDestructiveActions: z.boolean().optional(),
  manageSecurityPolicy: z.boolean().optional(),
});

const securityPolicySchema = z.object({
  requireSensitiveMfa: z.boolean().optional(),
  enhancedMonitoring: z.boolean().optional(),
  autoApplyGuardrails: z.boolean().optional(),
  reportSchedule: z.object({
    enabled: z.boolean().optional(),
    intervalHours: z.number().int().min(1).max(168).optional(),
    retainSnapshots: z.number().int().min(3).max(90).optional(),
    autoExport: z.boolean().optional(),
  }).optional(),
  rolePolicies: z.object({
    ADMIN: rolePolicySchema.optional(),
    MANAGER: rolePolicySchema.optional(),
    AUDITOR: rolePolicySchema.optional(),
    OPERATOR: rolePolicySchema.optional(),
  }).optional(),
});

router.get('/mfa/status', async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { mfaEnabled: true, email: true },
    });
    return res.json({
      enabled: !!user?.mfaEnabled,
      requireSensitiveMfa: config.security.requireSensitiveMfa,
      email: user?.email || null,
    });
  } catch (err: any) {
    logger.error('Error fetching MFA status', { error: err.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/mfa/setup', async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { email: true, mfaEnabled: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const setup = TotpService.createSetup(user.email, 'Camel');

    await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        mfaSecret: setup.encryptedSecret,
        mfaEnabled: false,
      },
    });

    return res.json({
      enabled: false,
      secret: setup.secret,
      otpauthUri: setup.otpauthUri,
    });
  } catch (err: any) {
    logger.error('Error preparing MFA setup', { error: err.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/mfa/enable', async (req: AuthRequest, res) => {
  try {
    const { code } = req.body || {};
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { mfaSecret: true },
    });

    if (!user?.mfaSecret) {
      return res.status(400).json({ error: 'MFA setup must be created first' });
    }

    if (!TotpService.verify(user.mfaSecret, code)) {
      return res.status(400).json({ error: 'Invalid MFA code' });
    }

    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { mfaEnabled: true },
    });

    return res.json({ enabled: true });
  } catch (err: any) {
    logger.error('Error enabling MFA', { error: err.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/mfa/disable', requireSensitiveMfa(), async (req: AuthRequest, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
      },
    });
    return res.json({ enabled: false });
  } catch (err: any) {
    logger.error('Error disabling MFA', { error: err.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /security/overview - Get enterprise security dashboard signals
router.get('/overview', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const overview = await SecurityDashboardService.getOverview(tenantId);
    return res.json(overview);
  } catch (err: any) {
    logger.error('Error fetching security overview', { error: err.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/posture', requireRole('ADMIN'), async (_req: AuthRequest, res) => {
  return res.json({
    host: config.host,
    trustedProxyHops: config.trustedProxyHops,
    exposeApiDocs: config.security.exposeApiDocs,
    exposeBullBoard: config.security.exposeBullBoard,
    allowRemoteSensitiveSurfaces: config.security.allowRemoteSensitiveSurfaces,
    adminIpAllowlist: config.security.adminIpAllowlist,
    sensitiveIpAllowlist: config.security.sensitiveIpAllowlist,
    requireSensitiveMfa: config.security.requireSensitiveMfa,
  });
});

router.get('/step-up/status/:actionKey', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  const satisfied = await StepUpAuthService.isSatisfied(req.user!.tenantId, req.user!.userId, req.params.actionKey);
  return res.json({ actionKey: req.params.actionKey, satisfied, ttlMinutes: config.security.stepUpTtlMinutes });
});

router.get('/policy', requireRole('ADMIN', 'AUDITOR'), async (req: AuthRequest, res) => {
  const policy = await SecurityPolicyService.getPolicy(req.user!.tenantId);
  return res.json(policy);
});

router.post(
  '/policy',
  requireRole('ADMIN', 'MANAGER'),
  requireSecurityCapability('manageSecurityPolicy'),
  requireStepUp('security.policy.update', { always: true }),
  async (req: AuthRequest, res) => {
  try {
    const updates = securityPolicySchema.parse(req.body || {});
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.user!.tenantId },
      select: { settings: true },
    });
    const settings = tenant?.settings && typeof tenant.settings === 'object'
      ? { ...(tenant.settings as Record<string, any>) }
      : {};
    const currentPolicy = settings.securityPolicy && typeof settings.securityPolicy === 'object'
      ? { ...(settings.securityPolicy as Record<string, any>) }
      : {};
    const nextPolicy = {
      ...currentPolicy,
      ...updates,
      reportSchedule: {
        ...(currentPolicy.reportSchedule && typeof currentPolicy.reportSchedule === 'object'
          ? currentPolicy.reportSchedule
          : {}),
        ...(updates.reportSchedule || {}),
      },
      rolePolicies: {
        ...(currentPolicy.rolePolicies && typeof currentPolicy.rolePolicies === 'object'
          ? currentPolicy.rolePolicies
          : {}),
        ...(updates.rolePolicies || {}),
      },
      lastUpdatedAt: new Date().toISOString(),
      lastUpdatedBy: req.user!.userId,
      source: 'security-dashboard',
    };
    await prisma.tenant.update({
      where: { id: req.user!.tenantId },
      data: {
        settings: {
          ...settings,
          securityPolicy: nextPolicy,
        } as any,
      },
    });
    await logAudit({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: 'security.policy_updated',
      resource: 'security:policy',
      detail: updates,
    });
    return res.json(SecurityPolicyService.mergePolicy(nextPolicy));
  } catch (err: any) {
    logger.error('Error updating security policy', { error: err.message });
    res.status(500).json({ error: err?.message || 'Internal error' });
  }
});

router.get('/report', requireRole('ADMIN', 'AUDITOR'), async (req: AuthRequest, res) => {
  try {
    const [{ report, actions }, overview, postureHistory, complianceReport, deploymentReadiness] = await Promise.all([
      SecurityGuardrailService.evaluateAndApply(req.user!.tenantId, req.user!.userId),
      SecurityDashboardService.getOverview(req.user!.tenantId),
      SecurityPostureSnapshotService.getHistory(req.user!.tenantId, 8),
      ComplianceReportService.build(req.user!.tenantId),
      DeploymentReadinessService.build(req.user!.tenantId),
    ]);
    return res.json({
      overview,
      posture: report.posture,
      auditIntegrity: report.auditIntegrity,
      destructiveActions: await DestructiveActionService.list(req.user!.tenantId, 25),
      honeyEvents: await CanaryTrapService.listHoneyEvents(20),
      postureReport: report,
      postureHistory,
      complianceReport,
      deploymentReadiness,
      guardrails: {
        actions,
        summary: actions[0]?.note || 'No guardrail changes were needed.',
      },
    });
  } catch (err: any) {
    logger.error('Error loading security posture report', { error: err.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/posture-report', requireRole('ADMIN', 'AUDITOR'), async (req: AuthRequest, res) => {
  try {
    const report = await SecurityPostureReportService.build(req.user!.tenantId);
    return res.json(report);
  } catch (err: any) {
    logger.error('Error loading posture report', { error: err.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/report/export', requireRole('ADMIN', 'MANAGER', 'AUDITOR'), requireSecurityCapability('exportReports'), async (req: AuthRequest, res) => {
  try {
    const report = await SecurityPostureReportService.build(req.user!.tenantId);
    const snapshot = await SecurityPostureSnapshotService.recordSnapshot(req.user!.tenantId, 'export');
    const [complianceReport, deploymentReadiness] = await Promise.all([
      ComplianceReportService.build(req.user!.tenantId),
      DeploymentReadinessService.build(req.user!.tenantId),
    ]);
    return res.json({
      exportType: 'tenant-security-posture',
      exportedAt: new Date().toISOString(),
      tenantId: req.user!.tenantId,
      signature: report.auditIntegrity.exportSignature,
      snapshot,
      report,
      complianceReport,
      deploymentReadiness,
    });
  } catch (err: any) {
    logger.error('Error exporting security posture report', { error: err.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/posture-history', requireRole('ADMIN', 'MANAGER', 'AUDITOR'), requireSecurityCapability('exportReports'), async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(30, Math.max(1, Number(req.query.limit || 12)));
    const history = await SecurityPostureSnapshotService.getHistory(req.user!.tenantId, limit);
    return res.json({ history });
  } catch (err: any) {
    logger.error('Error loading security posture history', { error: err.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/posture-snapshot', requireRole('ADMIN', 'MANAGER'), requireSecurityCapability('exportReports'), requireStepUp('security.posture.snapshot', { always: true }), async (req: AuthRequest, res) => {
  try {
    const snapshot = await SecurityPostureSnapshotService.recordSnapshot(req.user!.tenantId, 'manual');
    await logAudit({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: 'security.posture_snapshot.recorded',
      resource: 'security:posture_snapshot',
      detail: snapshot,
    });
    return res.json(snapshot);
  } catch (err: any) {
    logger.error('Error recording security posture snapshot', { error: err.message });
    res.status(500).json({ error: err?.message || 'Internal error' });
  }
});

router.post('/rotate/webhook/:id', requireRole('ADMIN', 'MANAGER'), requireSecurityCapability('rotateSecrets'), requireStepUp('webhook.rotate', { always: true }), async (req: AuthRequest, res) => {
  try {
    const result = await SecretRotationService.rotateWebhookSecret(req.user!.tenantId, req.user!.userId, req.params.id);
    await logAudit({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: 'webhook.secret_rotated',
      resource: `webhook:${req.params.id}`,
      detail: {
        webhookId: req.params.id,
        rotatedAt: result.rotatedAt,
      },
    });
    return res.json(result);
  } catch (err: any) {
    logger.error('Error rotating webhook secret', { error: err.message });
    res.status(500).json({ error: err?.message || 'Internal error' });
  }
});

router.get('/compliance-report', requireRole('ADMIN', 'MANAGER', 'AUDITOR'), requireSecurityCapability('exportReports'), async (req: AuthRequest, res) => {
  try {
    const report = await ComplianceReportService.build(req.user!.tenantId);
    return res.json(report);
  } catch (err: any) {
    logger.error('Error building compliance report', { error: err.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/deployment-readiness', requireRole('ADMIN', 'MANAGER', 'AUDITOR'), requireSecurityCapability('exportReports'), async (req: AuthRequest, res) => {
  try {
    const report = await DeploymentReadinessService.build(req.user!.tenantId);
    return res.json(report);
  } catch (err: any) {
    logger.error('Error building deployment readiness report', { error: err.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
