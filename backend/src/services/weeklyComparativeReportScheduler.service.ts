import { prisma } from '../prisma';
import { config } from '../config';
import { logger } from '../utils/logger';
import { WeeklyComparativeReportService } from './weeklyComparativeReport.service';

export class WeeklyComparativeReportSchedulerService {
  private static timer: NodeJS.Timeout | null = null;

  static start() {
    if (process.env.NODE_ENV === 'test') return;
    if (!config.weeklyComparativeReport.schedulerEnabled) {
      logger.info('Weekly comparative report scheduler disabled');
      return;
    }
    if (this.timer) return;

    const intervalHours = Math.max(6, config.weeklyComparativeReport.checkIntervalHours);
    this.timer = setInterval(() => {
      void this.runSweep();
    }, intervalHours * 60 * 60 * 1000);

    logger.info('Weekly comparative report scheduler started', { intervalHours });
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
          await WeeklyComparativeReportService.maybeRecordSnapshot(tenant.id);
        } catch (error: any) {
          logger.warn('Weekly comparative report tenant sweep failed', { tenantId: tenant.id, error: error?.message });
        }
      }
    } catch (error: any) {
      logger.warn('Weekly comparative report scheduler failed', { error: error?.message });
    }
  }
}
