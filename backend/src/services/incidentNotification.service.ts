import { prisma } from '../prisma';
import { IncidentCenterService, IncidentRecord } from './incidentCenter.service';
import { SlackService } from './slack.service';
import { TeamsService } from './teams.service';
import { logger } from '../utils/logger';

interface IncidentNotificationSettings {
  enabled: boolean;
  cooldownMinutes: number;
  notifyWarnings: boolean;
  slackWebhookUrl?: string;
  teamsWebhookUrl?: string;
  snoozedUntilByCode?: Record<string, string>;
}

export class IncidentNotificationService {
  static defaults(): IncidentNotificationSettings {
    return {
      enabled: false,
      cooldownMinutes: 30,
      notifyWarnings: false,
      slackWebhookUrl: '',
      teamsWebhookUrl: '',
      snoozedUntilByCode: {},
    };
  }

  static async getSettings(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    return this.normalizeSettings(tenant?.settings);
  }

  static async updateSettings(tenantId: string, input: Partial<IncidentNotificationSettings>) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
    const tenantSettings = tenant.settings && typeof tenant.settings === 'object' ? tenant.settings as Record<string, any> : {};
    const next = {
      ...this.normalizeSettings(tenantSettings),
      ...input,
      cooldownMinutes: Number(input.cooldownMinutes ?? this.normalizeSettings(tenantSettings).cooldownMinutes),
    };
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...tenantSettings,
          incidentCenter: {
            ...(tenantSettings?.incidentCenter || {}),
            notifications: next,
          },
        } as any,
      },
    });
    return next;
  }

  static async notifyOpenIncidents(tenantId: string, incidents: IncidentRecord[], reason: 'auto' | 'manual' = 'auto') {
    const settings = await this.getSettings(tenantId);
    const openIncidents = incidents.filter((incident) => incident.status !== 'resolved');

    if (!settings.enabled) {
      return {
        enabled: false,
        attempted: 0,
        sent: 0,
        skipped: openIncidents.length,
      };
    }

    const candidates = openIncidents.filter((incident) => {
      if (incident.severity === 'warning' && !settings.notifyWarnings) return false;
      const snoozedUntil = settings.snoozedUntilByCode?.[incident.code];
      if (snoozedUntil && new Date(snoozedUntil).getTime() > Date.now()) return false;
      const lastSent = Array.isArray(incident.notificationHistory)
        ? incident.notificationHistory.find((entry) => entry.status === 'sent')
        : null;
      if (!lastSent) return true;
      const elapsedMinutes = (Date.now() - new Date(lastSent.at).getTime()) / 60000;
      return elapsedMinutes >= settings.cooldownMinutes;
    });

    let sent = 0;
    let skipped = openIncidents.length - candidates.length;

    for (const incident of candidates.slice(0, 3)) {
      const title = `Camel Incident: ${incident.title}`;
      const message = [
        `Tenant: \`${tenantId}\``,
        `Severity: \`${incident.severity}\``,
        `Source: \`${incident.source}\``,
        `Reason: ${reason}`,
        '',
        incident.summary,
        '',
        `Evidence: \`${JSON.stringify(incident.evidence || {})}\``,
      ].join('\n');

      let delivered = false;

      if (settings.slackWebhookUrl) {
        try {
          await SlackService.sendNotification(settings.slackWebhookUrl, title, message, incident.severity === 'critical' ? 'CRITICAL' : 'WARNING');
          delivered = true;
          await IncidentCenterService.appendNotification(tenantId, incident.id, {
            channel: 'slack',
            kind: incident.severity === 'critical' ? 'critical' : 'digest',
            status: 'sent',
            note: reason,
          });
        } catch (error: any) {
          logger.warn('Incident Slack notify failed', { tenantId, incidentId: incident.id, error: error?.message });
          await IncidentCenterService.appendNotification(tenantId, incident.id, {
            channel: 'slack',
            kind: incident.severity === 'critical' ? 'critical' : 'digest',
            status: 'failed',
            note: error?.message || reason,
          });
        }
      }

      if (settings.teamsWebhookUrl) {
        try {
          await TeamsService.sendNotification(settings.teamsWebhookUrl, title, message, incident.severity === 'critical' ? 'CRITICAL' : 'WARNING');
          delivered = true;
          await IncidentCenterService.appendNotification(tenantId, incident.id, {
            channel: 'teams',
            kind: incident.severity === 'critical' ? 'critical' : 'digest',
            status: 'sent',
            note: reason,
          });
        } catch (error: any) {
          logger.warn('Incident Teams notify failed', { tenantId, incidentId: incident.id, error: error?.message });
          await IncidentCenterService.appendNotification(tenantId, incident.id, {
            channel: 'teams',
            kind: incident.severity === 'critical' ? 'critical' : 'digest',
            status: 'failed',
            note: error?.message || reason,
          });
        }
      }

      if (delivered) {
        sent += 1;
      } else {
        skipped += 1;
      }
    }

    return {
      enabled: true,
      attempted: candidates.length,
      sent,
      skipped,
      cooldownMinutes: settings.cooldownMinutes,
    };
  }

  static summarize(incidents: IncidentRecord[]) {
    const lastEntries = incidents.flatMap((incident) => incident.notificationHistory || []).slice(0, 20);
    return {
      totalEvents: lastEntries.length,
      sent: lastEntries.filter((entry) => entry.status === 'sent').length,
      failed: lastEntries.filter((entry) => entry.status === 'failed').length,
      lastSentAt: lastEntries.find((entry) => entry.status === 'sent')?.at || null,
    };
  }

  private static normalizeSettings(settings?: any): IncidentNotificationSettings {
    return {
      ...this.defaults(),
      ...(settings as any)?.incidentCenter?.notifications,
      cooldownMinutes: Number((settings as any)?.incidentCenter?.notifications?.cooldownMinutes || this.defaults().cooldownMinutes),
      snoozedUntilByCode: ((settings as any)?.incidentCenter?.notifications?.snoozedUntilByCode) || {},
    };
  }
}
