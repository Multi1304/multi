import { prisma } from '../prisma';
import { logger } from '../utils/logger';
import { AuditIntegrityService } from './auditIntegrity.service';

import { SlackService } from './slack.service';
import { TeamsService } from './teams.service';

export interface AuditEntry {
  tenantId: string;
  userId: string;
  action: string;
  resource: string;
  detail?: any;
  ip?: string;
}

export function normalizeAuditRecord(record: any) {
  const rawDetail = record?.detail;
  let detail = rawDetail;
  if (typeof rawDetail === 'string') {
    try {
      detail = JSON.parse(rawDetail);
    } catch {
      detail = rawDetail;
    }
  }

  const [resourceType, ...resourceTail] = String(record?.resource || '').split(':');
  return {
    ...record,
    detail,
    metadata: detail,
    ipAddress: record?.ip || null,
    resourceType: resourceTail.length > 0 ? resourceType : null,
    resourceId: resourceTail.length > 0 ? resourceTail.join(':') : record?.resource || null,
  };
}

export function summarizeAuditActions(records: any[]) {
  const counter = new Map<string, number>();
  for (const record of records) {
    const key = record.action || 'unknown';
    counter.set(key, (counter.get(key) || 0) + 1);
  }

  return Array.from(counter.entries())
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

/**
 * Log an auditable action and broadcast to Collab channels.
 */
export async function logAudit(entry: AuditEntry) {
  try {
    const createdAt = new Date();
    const prevHash = await AuditIntegrityService.getPreviousHash(entry.tenantId);
    const integrity = AuditIntegrityService.buildIntegrity({
      prevHash,
      tenantId: entry.tenantId,
      userId: entry.userId,
      action: entry.action,
      resource: entry.resource,
      detail: entry.detail ?? null,
      createdAt,
    });

    await prisma.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        userId: entry.userId,
        action: entry.action,
        resource: entry.resource,
        detail: AuditIntegrityService.attachIntegrity(entry.detail ?? null, integrity),
        ip: entry.ip || null,
        createdAt,
      },
    });

    // V3 Eje 4: Collab Broadcasting for High-Impact Events
    const collabEvents = [
      'profile.share',
      'profile.access.revoke',
      'flow.share',
      'flow.access.revoke',
      'team.role.change',
      'team.member.remove',
      'flow.delete',
      'tenant.suspended'
    ];
    if (collabEvents.includes(entry.action)) {
       // In a real V3, we'd fetch the configured webhooks from DB for this tenant
       // Example simulation broadcasting:
       const message = `Audit Event: *${entry.action}* by *User ${entry.userId}* on *${entry.resource}*\nDetails: ${JSON.stringify(entry.detail || {})}`;
       
       // Disabled actual network cal in demo, just logging intent
       logger.info(`[V3 Collab Stream] Broadcasting ${entry.action} to Slack/Teams integrations.`);
       // await SlackService.sendNotification('https://hooks.slack.com/...', 'Collaboration Event', message);
       // await TeamsService.sendNotification('https://outlook.office.com/...', 'Collaboration Event', message);
    }
  } catch (err: any) {
    // Audit logging should never crash the request
    logger.error('Failed to write audit log', { error: err?.message, ...entry });
  }
}
