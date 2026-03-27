/**
 * Job handler registry.
 * Maps job type names to their handler functions.
 */
import { loginCheckHandler } from './login-check.job';
import { browserActionHandler } from './browser-action.job';
import { scrapeHandler } from './scrape.job';
import { sessionMaintenanceHandler } from './session-maintenance.job';
import { Job } from 'bullmq';

export type JobHandler = (job: Job) => Promise<any>;

const registry: Record<string, JobHandler> = {
  login_check: loginCheckHandler,
  browser_action: browserActionHandler,
  scrape: scrapeHandler,
  session_maintenance: sessionMaintenanceHandler,
};

/**
 * Get the handler for a given job type.
 * Returns undefined if no specific handler exists (worker uses default).
 */
export function getJobHandler(type: string): JobHandler | undefined {
  return registry[type];
}

/**
 * Register a new job handler at runtime.
 */
export function registerJobHandler(type: string, handler: JobHandler) {
  registry[type] = handler;
}

/**
 * List all registered job types.
 */
export function listJobTypes(): string[] {
  return Object.keys(registry);
}
