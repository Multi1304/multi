import { prisma } from '../prisma';
import { config } from '../config';
import { logger } from '../utils/logger';
import { PredictiveWarmupQueueService } from './predictiveWarmupQueue.service';

export class PredictiveWarmupSchedulerService {
  private static rebuildTimer: NodeJS.Timeout | null = null;
  private static executionTimer: NodeJS.Timeout | null = null;

  static start() {
    if (process.env.NODE_ENV === 'test') return;
    if (!config.predictiveWarmup.schedulerEnabled) {
      logger.info('Predictive warmup scheduler disabled');
      return;
    }
    if (!this.rebuildTimer) {
      const rebuildMs = Math.max(1, config.predictiveWarmup.rebuildIntervalHours) * 60 * 60 * 1000;
      this.rebuildTimer = setInterval(() => {
        void this.rebuildSweep();
      }, rebuildMs);
      void this.rebuildSweep();
      logger.info('Predictive warmup rebuild scheduler started', {
        intervalHours: config.predictiveWarmup.rebuildIntervalHours,
      });
    }

    if (!this.executionTimer) {
      const executionMs = Math.max(5, config.predictiveWarmup.executionIntervalMinutes) * 60 * 1000;
      this.executionTimer = setInterval(() => {
        void this.executionSweep();
      }, executionMs);
      void this.executionSweep();
      logger.info('Predictive warmup execution scheduler started', {
        intervalMinutes: config.predictiveWarmup.executionIntervalMinutes,
      });
    }
  }

  static stop() {
    if (this.rebuildTimer) clearInterval(this.rebuildTimer);
    if (this.executionTimer) clearInterval(this.executionTimer);
    this.rebuildTimer = null;
    this.executionTimer = null;
  }

  static async rebuildSweep() {
    try {
      const tenants = await prisma.tenant.findMany({ select: { id: true } });
      for (const tenant of tenants) {
        try {
          await PredictiveWarmupQueueService.rebuildNightlyQueue(tenant.id, null);
        } catch (error: any) {
          logger.warn('Predictive warmup rebuild failed for tenant', { tenantId: tenant.id, error: error?.message });
        }
      }
    } catch (error: any) {
      logger.warn('Predictive warmup rebuild sweep failed', { error: error?.message });
    }
  }

  static async executionSweep() {
    try {
      const tenants = await prisma.tenant.findMany({ select: { id: true } });
      for (const tenant of tenants) {
        try {
          await PredictiveWarmupQueueService.processDueEntries(tenant.id);
        } catch (error: any) {
          logger.warn('Predictive warmup execution failed for tenant', { tenantId: tenant.id, error: error?.message });
        }
      }
    } catch (error: any) {
      logger.warn('Predictive warmup execution sweep failed', { error: error?.message });
    }
  }
}
