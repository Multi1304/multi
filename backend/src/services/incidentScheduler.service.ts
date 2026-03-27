import { prisma } from '../prisma';
import { logger } from '../utils/logger';
import { config } from '../config';
import { IncidentSignalService } from './incidentSignal.service';
import { IncidentCenterService } from './incidentCenter.service';
import { IncidentNotificationService } from './incidentNotification.service';

export class IncidentSchedulerService {
  private static timer: NodeJS.Timeout | null = null;

  static start() {
    if (!config.incidents.schedulerEnabled || process.env.NODE_ENV === 'test') return;
    if (this.timer) return;

    const intervalMs = Math.max(1, config.incidents.intervalMinutes) * 60 * 1000;
    this.timer = setInterval(() => {
      void this.runSweep();
    }, intervalMs);

    logger.info('Incident scheduler started', { intervalMinutes: config.incidents.intervalMinutes });
    void this.runSweep();
  }

  static stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  static async runSweep() {
    try {
      const tenants = await prisma.tenant.findMany({ select: { id: true } });
      for (const tenant of tenants) {
        try {
          const signals = await IncidentSignalService.collect(tenant.id);
          const incidents = await IncidentCenterService.syncFromSignals(tenant.id, signals);
          await IncidentNotificationService.notifyOpenIncidents(tenant.id, incidents, 'auto');
        } catch (error: any) {
          logger.warn('Incident scheduler tenant sweep failed', { tenantId: tenant.id, error: error?.message });
        }
      }
    } catch (error: any) {
      logger.warn('Incident scheduler run failed', { error: error?.message });
    }
  }
}
