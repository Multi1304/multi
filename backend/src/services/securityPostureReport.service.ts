import { prisma } from '../prisma';
import { SecurityPostureService } from './securityPosture.service';
import { AuditIntegrityService } from './auditIntegrity.service';
import { DestructiveActionService } from './destructiveAction.service';
import { CanaryTrapService } from './canaryTrap.service';

type RotationReason = 'expiring_soon' | 'stale_unused' | 'canary_key';
type WebhookRotationReason = 'periodic_rotation';

export class SecurityPostureReportService {
  static async build(tenantId: string) {
    const [posture, auditIntegrity, destructiveActions, honeyEvents, apiKeys, webhooks] = await Promise.all([
      SecurityPostureService.getSnapshot(tenantId),
      AuditIntegrityService.verifyTenant(tenantId),
      DestructiveActionService.list(tenantId, 50),
      CanaryTrapService.listHoneyEvents(25),
      (prisma as any).apiKey.findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          prefix: true,
          scopes: true,
          expiresAt: true,
          lastUsed: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      (prisma as any).webhook.findMany({
        where: { tenantId, active: true },
        select: {
          id: true,
          url: true,
          events: true,
          active: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const pendingDestructive = destructiveActions.filter((task) => task.status === 'pending');
    const webhookRotationCandidates = webhooks
      .filter((webhook: any) => now - new Date(webhook.createdAt).getTime() > thirtyDays)
      .slice(0, 8)
      .map((webhook: any) => ({
        id: webhook.id,
        url: webhook.url,
        events: Array.isArray(webhook.events) ? webhook.events : [],
        reason: 'periodic_rotation' as WebhookRotationReason,
        summary: 'Active webhook secret has been in service for more than 30 days.',
      }));

    const apiKeyRotationCandidates = apiKeys.flatMap((key: any) => {
      const candidates: Array<{
        id: string;
        name: string;
        prefix: string;
        reason: RotationReason;
        summary: string;
        graceMinutes: number;
      }> = [];

      const expiresAt = key.expiresAt ? new Date(key.expiresAt).getTime() : null;
      const lastUsedAt = key.lastUsed ? new Date(key.lastUsed).getTime() : new Date(key.createdAt).getTime();
      const scopes = Array.isArray(key.scopes) ? key.scopes : [];

      if (expiresAt && expiresAt - now <= sevenDays) {
        candidates.push({
          id: key.id,
          name: key.name,
          prefix: key.prefix,
          reason: 'expiring_soon',
          summary: 'Expires within the next 7 days.',
          graceMinutes: 60,
        });
      }

      if (now - lastUsedAt > thirtyDays) {
        candidates.push({
          id: key.id,
          name: key.name,
          prefix: key.prefix,
          reason: 'stale_unused',
          summary: 'No recent activity detected in the last 30 days.',
          graceMinutes: 30,
        });
      }

      if (scopes.includes('canary:trip')) {
        candidates.push({
          id: key.id,
          name: key.name,
          prefix: key.prefix,
          reason: 'canary_key',
          summary: 'Canary key should be rotated after verification or investigation.',
          graceMinutes: 15,
        });
      }

      return candidates;
    }).slice(0, 8);

    const priorities: string[] = [];
    if (posture.remoteExposureDetected && !posture.adminAllowlistConfigured) {
      priorities.push('Configure an admin IP allowlist before widening access beyond localhost.');
    }
    if (posture.remoteExposureDetected && !posture.requireSensitiveMfa) {
      priorities.push('Enforce sensitive MFA automatically when Camel is reachable remotely.');
    }
    if (auditIntegrity.broken > 0) {
      priorities.push(`Audit integrity has ${auditIntegrity.broken} broken entries and should be reviewed immediately.`);
    }
    if (honeyEvents.length > 0) {
      priorities.push(`Honey or canary activity detected (${honeyEvents.length} recent events). Keep enhanced monitoring active.`);
    }
    if (pendingDestructive.length > 0) {
      priorities.push(`${pendingDestructive.length} delayed destructive action(s) are pending review.`);
    }
    if (apiKeyRotationCandidates.length > 0) {
      priorities.push(`${apiKeyRotationCandidates.length} API key(s) need rotation or review.`);
    }
    if (webhookRotationCandidates.length > 0) {
      priorities.push(`${webhookRotationCandidates.length} active webhook secret(s) should be rotated.`);
    }

    const status =
      auditIntegrity.broken > 0 || (posture.remoteExposureDetected && !posture.adminAllowlistConfigured)
        ? 'critical'
        : priorities.length > 0
          ? 'needs_attention'
          : 'stable';

    return {
      status,
      generatedAt: new Date().toISOString(),
      priorities: priorities.slice(0, 6),
      workspaceRecommendations: [
        posture.requireSensitiveMfa
          ? 'Sensitive MFA is already enforced for risky actions.'
          : 'Sensitive MFA is ready to enforce as soon as Camel leaves localhost.',
        posture.adminAllowlistConfigured
          ? 'Admin IP fence is configured.'
          : 'Admin IP fence is missing.',
        honeyEvents.length > 0
          ? 'Enhanced monitoring should remain enabled while honey signals are active.'
          : 'Honey and canary guardrails are quiet.',
      ],
      apiKeyRotationCandidates,
      webhookRotationCandidates,
      delayedDestructiveSummary: {
        total: destructiveActions.length,
        pending: pendingDestructive.length,
        failed: destructiveActions.filter((task) => task.status === 'failed').length,
      },
      honeySummary: {
        count: honeyEvents.length,
        latest: honeyEvents[0] || null,
      },
      auditIntegrity,
      posture,
    };
  }
}
