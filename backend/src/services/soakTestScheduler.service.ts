import { prisma } from '../prisma';
import { config } from '../config';
import { logger } from '../utils/logger';
import { SoakTestService } from './soakTest.service';

export class SoakTestSchedulerService {
  private static timer: NodeJS.Timeout | null = null;

  static start() {
    if (process.env.NODE_ENV === 'test') return;
    if (!config.soakTesting.schedulerEnabled) {
      logger.info('Soak test scheduler disabled');
      return;
    }
    if (this.timer) return;

    const run = async () => {
      try {
        const tenants = await prisma.tenant.findMany({ select: { id: true } });
        for (const tenant of tenants) {
          await SoakTestService.recordSnapshot(tenant.id, config.soakTesting.windowMinutes);
        }
        logger.info('Soak test scheduler recorded snapshots', { tenants: tenants.length });
      } catch (error: any) {
        logger.warn('Soak test scheduler failed', { error: error?.message });
      }
    };

    const intervalMs = Math.max(5, config.soakTesting.intervalMinutes) * 60 * 1000;
    this.timer = setInterval(run, intervalMs);
    void run();
    logger.info('Soak test scheduler started', {
      intervalMinutes: config.soakTesting.intervalMinutes,
      windowMinutes: config.soakTesting.windowMinutes,
    });
  }

  static stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
