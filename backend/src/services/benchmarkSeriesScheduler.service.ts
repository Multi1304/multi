import { prisma } from '../prisma';
import { config } from '../config';
import { logger } from '../utils/logger';
import { BenchmarkSeriesService } from './benchmarkSeries.service';
import { LongRunSoakService } from './longRunSoak.service';

export class BenchmarkSeriesSchedulerService {
  private static timer: NodeJS.Timeout | null = null;

  static start() {
    if (process.env.NODE_ENV === 'test') return;
    if (!config.benchmarkSeries.schedulerEnabled) {
      logger.info('Benchmark series scheduler disabled');
      return;
    }
    if (this.timer) return;

    const intervalHours = Math.max(2, config.benchmarkSeries.intervalHours);
    this.timer = setInterval(() => {
      void this.runSweep();
    }, intervalHours * 60 * 60 * 1000);

    logger.info('Benchmark series scheduler started', { intervalHours });
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
          await BenchmarkSeriesService.recordSnapshot(tenant.id, {
            releaseLabel: config.releaseGates.releaseLabel,
            commitRef: config.releaseGates.commitRef,
          });
          await LongRunSoakService.recordAllProfiles(tenant.id);
        } catch (error: any) {
          logger.warn('Benchmark series scheduler tenant sweep failed', { tenantId: tenant.id, error: error?.message });
        }
      }
    } catch (error: any) {
      logger.warn('Benchmark series scheduler failed', { error: error?.message });
    }
  }
}
