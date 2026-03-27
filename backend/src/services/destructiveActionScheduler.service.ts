import { config } from '../config';
import { logger } from '../utils/logger';
import { DestructiveActionService } from './destructiveAction.service';

let timer: NodeJS.Timeout | null = null;

export class DestructiveActionSchedulerService {
  static start() {
    if (!DestructiveActionService.isEnabled()) {
      logger.info('Destructive action scheduler disabled by config');
      return;
    }
    if (timer) return;

    const intervalMs = Math.max(1000, config.destructiveActions.schedulerIntervalSeconds * 1000);
    timer = setInterval(async () => {
      try {
        await DestructiveActionService.processDue();
      } catch (error: any) {
        logger.error('Destructive action scheduler error', { error: error?.message });
      }
    }, intervalMs);

    logger.info('Destructive action scheduler started', { intervalMs });
  }
}
