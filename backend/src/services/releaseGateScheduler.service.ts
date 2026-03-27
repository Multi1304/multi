import { prisma } from '../prisma';
import { config } from '../config';
import { logger } from '../utils/logger';
import { ReleaseGateService } from './releaseGate.service';

export class ReleaseGateSchedulerService {
  private static timer: NodeJS.Timeout | null = null;

  static start() {
    if (process.env.NODE_ENV === 'test') return;
    if (!config.releaseGates.schedulerEnabled) {
      logger.info('Release gate scheduler disabled');
      return;
    }
    if (this.timer) return;

    const run = async () => {
      try {
        const tenants = await prisma.tenant.findMany({ select: { id: true } });
        for (const tenant of tenants) {
          await ReleaseGateService.recordSnapshot(tenant.id, {
            releaseLabel: config.releaseGates.releaseLabel,
            commitRef: config.releaseGates.commitRef,
          });
        }
        logger.info('Release gate scheduler recorded snapshots', { tenants: tenants.length });
      } catch (error: any) {
        logger.warn('Release gate scheduler failed', { error: error?.message });
      }
    };

    const intervalMs = Math.max(5, config.releaseGates.intervalMinutes) * 60 * 1000;
    this.timer = setInterval(run, intervalMs);
    void run();
    logger.info('Release gate scheduler started', {
      intervalMinutes: config.releaseGates.intervalMinutes,
      releaseLabel: config.releaseGates.releaseLabel,
      commitRef: config.releaseGates.commitRef,
    });
  }

  static stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
