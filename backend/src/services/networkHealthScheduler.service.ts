import { prisma } from '../prisma';
import { logger } from '../utils/logger';
import { NetworkRoutingService } from './networkRouting.service';

export class NetworkHealthSchedulerService {
  private static timer: NodeJS.Timeout | null = null;

  static start() {
    if (process.env.NODE_ENV === 'test') return;
    if (this.timer) return;
    const intervalMinutes = Math.max(5, Number(process.env.NETWORK_HEALTH_INTERVAL_MINUTES || 20));
    this.timer = setInterval(() => {
      void this.runSweep();
    }, intervalMinutes * 60 * 1000);
    logger.info('Network health scheduler started', { intervalMinutes });
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
      const endpoints = await (prisma as any).proxyEndpoint.findMany({
        where: {
          OR: [
            { isActive: true },
            { status: 'ACTIVE' },
            { status: 'DEGRADED' },
          ],
        },
        select: { id: true },
        take: 100,
      });
      for (const endpoint of endpoints) {
        try {
          await NetworkRoutingService.healthCheckEndpoint(endpoint.id);
        } catch (error: any) {
          logger.warn('Network health endpoint check failed', { endpointId: endpoint.id, error: error?.message });
        }
      }
    } catch (error: any) {
      logger.warn('Network health scheduler failed', { error: error?.message });
    }
  }
}
