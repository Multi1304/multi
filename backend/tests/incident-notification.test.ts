import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IncidentNotificationService } from '../src/services/incidentNotification.service';
import { IncidentCenterService } from '../src/services/incidentCenter.service';
import { SlackService } from '../src/services/slack.service';
import { TeamsService } from '../src/services/teams.service';
import { prisma } from '../src/prisma';

vi.mock('../src/prisma', () => ({
  prisma: {
    tenant: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('incident notification service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads sane defaults when no settings exist', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue({ settings: {} });
    const settings = await IncidentNotificationService.getSettings('tenant-1');
    expect(settings.enabled).toBe(false);
    expect(settings.cooldownMinutes).toBe(30);
  });

  it('sends notifications for open critical incidents when enabled', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue({
      settings: {
        incidentCenter: {
          notifications: {
            enabled: true,
            cooldownMinutes: 5,
            notifyWarnings: false,
            slackWebhookUrl: 'https://example.test/slack',
            teamsWebhookUrl: '',
          },
        },
      },
    });
    vi.spyOn(SlackService, 'sendNotification').mockResolvedValue(undefined as any);
    vi.spyOn(TeamsService, 'sendNotification').mockResolvedValue(undefined as any);
    vi.spyOn(IncidentCenterService, 'appendNotification').mockResolvedValue({} as any);

    const summary = await IncidentNotificationService.notifyOpenIncidents('tenant-1', [{
      id: 'incident-1',
      code: 'release_gate_failed',
      title: 'Release gates failing',
      severity: 'critical',
      status: 'open',
      source: 'release_gates',
      summary: 'Gate score below threshold',
      evidence: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notificationHistory: [],
    }] as any, 'manual');

    expect(summary.sent).toBe(1);
    expect(SlackService.sendNotification).toHaveBeenCalled();
  });
});
