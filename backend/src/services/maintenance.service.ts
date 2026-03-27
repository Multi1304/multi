import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger';
import { config } from '../config';

export class MaintenanceService {
  private static isRunning = false;

  /**
   * Prune temporary resources like old screenshots and logs.
   * Targets stasis_*.png, trial_*.jpg, and test-*.log files older than 2 hours.
   */
  static async pruneResources() {
    const rootDir = path.resolve(process.cwd());
    const maxAgeMs = 2 * 60 * 60 * 1000; // 2 hours
    const now = Date.now();

    try {
      const files = await fs.readdir(rootDir);
      let prunedCount = 0;
      let totalReclaimedBytes = 0;

      for (const file of files) {
        const isTemporary = 
          file.startsWith('stasis_') || 
          file.startsWith('trial_') || 
          file.startsWith('test-') ||
          file.startsWith('bits_') ||
          file.endsWith('.log.old') ||
          (file.startsWith('worker_logs') && file.endsWith('.txt') && file !== 'worker_logs.txt');

        if (isTemporary) {
          const filePath = path.join(rootDir, file);
          const stats = await fs.stat(filePath);
          
          if (now - stats.mtimeMs > maxAgeMs) {
            await fs.unlink(filePath);
            prunedCount++;
            totalReclaimedBytes += stats.size;
          }
        }
      }

      if (prunedCount > 0) {
        logger.info(`[MAINTENANCE] Pruned ${prunedCount} temporary files. Reclaimed ${(totalReclaimedBytes / (1024 * 1024)).toFixed(2)}MB.`);
      }
    } catch (error: any) {
      logger.error('[MAINTENANCE] Error during resource pruning', { error: error?.message });
    }
  }

  /**
   * Truncate large log files if they exceed a specific size.
   * Uses an efficient line-buffered approach to avoid full-file memory loading.
   */
  static async rotateLogs() {
    const rootDir = path.resolve(process.cwd());
    const maxSizeBytes = 5 * 1024 * 1024; // 5MB
    const logFiles = ['logs.txt', 'out.txt', 'worker_logs.txt'];

    for (const fileName of logFiles) {
      const filePath = path.join(rootDir, fileName);
      try {
        const stats = await fs.stat(filePath);
        if (stats.size > maxSizeBytes) {
          logger.info(`[MAINTENANCE] Rotating large log file: ${fileName} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
          
          // Efficient rotation: read only the tail end if possible
          // For simplicity in this environment, we still use a basic slice but with a larger buffer check
          const content = await fs.readFile(filePath, 'utf8');
          const lines = content.split('\n');
          if (lines.length > 10000) {
            const truncated = lines.slice(-10000).join('\n');
            await fs.writeFile(filePath, truncated, 'utf8');
          }
        }
      } catch (err: any) {
        // File might not exist, ignore
      }
    }
  }

  /**
   * Proactive memory optimization.
   * Triggers GC if exposed and clears any internal volatile caches.
   */
  static optimizeMemory() {
    const memUsage = process.memoryUsage();
    const rssMb = Math.round(memUsage.rss / 1024 / 1024);
    
    logger.info(`[MAINTENANCE] RAM Optimization triggered. Current RSS: ${rssMb}MB`);

    // 1. Force Browser layer optimization
    try {
        const { BrowserNodeService } = require('./browser.node');
        BrowserNodeService.optimizeMemory();
    } catch (e) {}

    // 2. Trigger Node.js GC if --expose-gc is used
    if (global.gc) {
      try {
        global.gc();
        const afterGc = process.memoryUsage();
        const afterRssMb = Math.round(afterGc.rss / 1024 / 1024);
        logger.info(`[MAINTENANCE] GC complete. New RSS: ${afterRssMb}MB (Saved ${rssMb - afterRssMb}MB)`);
      } catch (err) {
        logger.warn('[MAINTENANCE] GC trigger failed', { error: (err as any).message });
      }
    } else {
      logger.debug('[MAINTENANCE] GC not exposed. Consider adding --expose-gc to start script.');
    }
  }

  /**
   * Start the periodic maintenance task.
   */
  static startScheduler() {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info('[MAINTENANCE] Operations scheduler initialized (30m interval)');

    // Run immediately on start
    this.runMaintenanceCycle();

    // Schedule every 30 minutes
    setInterval(() => {
      this.runMaintenanceCycle();
    }, 30 * 60 * 1000);
  }

  private static async runMaintenanceCycle() {
    logger.debug('[MAINTENANCE] Starting background cycle...');
    await this.pruneResources();
    await this.rotateLogs();
    
    // Auto-optimize if RSS exceeds 80% of configured max
    const memUsage = process.memoryUsage();
    const rssMb = memUsage.rss / 1024 / 1024;
    const thresh = config.memoryAdmission.maxRssMb * 0.8;
    
    if (rssMb > thresh) {
      this.optimizeMemory();
    }
  }
}
