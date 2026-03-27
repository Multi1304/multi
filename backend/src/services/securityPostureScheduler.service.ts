import { prisma } from '../prisma';
import { config } from '../config';
import { logger } from '../utils/logger';
import { SecurityPolicyService } from './securityPolicy.service';
import { SecurityPostureSnapshotService } from './securityPostureSnapshot.service';

export class SecurityPostureSchedulerService {
  private static timer: NodeJS.Timeout | null = null;
  private static running = false;

  static start() {
    if (!config.security.postureSchedulerEnabled || this.timer) {
      return;
    }

    const intervalMs = Math.max(5, config.security.postureSchedulerCheckMinutes) * 60 * 1000;
    this.timer = setInterval(() => {
      this.runPass().catch((error) => {
        logger.warn('Security posture scheduler pass failed', {
          error: (error as Error)?.message,
        });
      });
    }, intervalMs);

    logger.info('Security posture scheduler started', {
      intervalMinutes: config.security.postureSchedulerCheckMinutes,
    });
  }

  static stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  static async runPass() {
    if (this.running) {
      return;
    }
    this.running = true;

    try {
      const tenants = await prisma.tenant.findMany({
        select: { id: true, settings: true },
      });

      for (const tenant of tenants) {
        const settings = tenant.settings && typeof tenant.settings === 'object'
          ? (tenant.settings as Record<string, any>)
          : {};
        const policy = SecurityPolicyService.mergePolicy(settings.securityPolicy);
        if (!policy.reportSchedule.enabled) {
          continue;
        }

        const lastSnapshotAt = settings.securityPostureLastSnapshotAt
          ? new Date(settings.securityPostureLastSnapshotAt).getTime()
          : 0;
        const minIntervalMs = policy.reportSchedule.intervalHours * 60 * 60 * 1000;
        const shouldRecord = !lastSnapshotAt || (Date.now() - lastSnapshotAt) >= minIntervalMs;

        if (shouldRecord) {
          await SecurityPostureSnapshotService.recordSnapshot(
            tenant.id,
            policy.reportSchedule.autoExport ? 'export' : 'scheduled'
          );
        }
      }
    } finally {
      this.running = false;
    }
  }
}
