import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../utils/redis';
import { logger } from '../utils/logger';
import { SpoofEngine } from '../core/spoof';
import { ScaleMetricsService } from './scaleMetrics.service';
import { TenantCapacityService } from './tenantCapacity.service';
import { prisma } from '../prisma';
import { config } from '../config';
import { MemoryAdmissionService } from './memoryAdmission.service';

export class QueueService {
  private static readonly QUEUE_NAME = 'camelfarm-sessions';
  public static sessionQueue: Queue;
  private static worker: Worker;

  /**
   * Initializes the session queue and worker.
   * Concurrency is controlled by runtime configuration.
   */
  static init() {
    this.sessionQueue = new Queue(this.QUEUE_NAME, { connection: redis as any });
    
    this.worker = new Worker(this.QUEUE_NAME, async (job: Job) => {
      logger.info('Processing Stealth Session Job', { jobId: job.id, profileId: job.data.profileId });
      
      try {
        await MemoryAdmissionService.assertCapacity('queue-worker');

        const result = await SpoofEngine.launchProfile(job.data.config);
        return { success: true, profileId: job.data.profileId };
      } catch (err: any) {
        logger.error('Session Launch Failed', { error: err.message });
        throw err;
      }
    }, { 
      connection: redis as any,
      concurrency: config.worker.concurrency
    });

    logger.info('CamelFarm Session Queue Initialized', { concurrency: config.worker.concurrency });
  }

  static async addSession(profileId: string, config: any) {
    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      select: { tenantId: true }
    });
    if (!profile) {
      throw new Error(`Profile ${profileId} not found`);
    }
    await TenantCapacityService.assertCanRunProfile(profile.tenantId, profileId);
    await MemoryAdmissionService.assertCapacity(`queue:${profileId}`);

    const jobId = `launch:${profileId}`;
    const existing = await this.sessionQueue.getJob(jobId);
    if (existing) {
      const state = await existing.getState().catch(() => 'unknown');
      if (['waiting', 'active', 'delayed'].includes(state)) {
        logger.warn('Session launch deduplicated for profile', { profileId, jobId, state });
        return existing;
      }
    }

    const job = await this.sessionQueue.add('launch', { profileId, config }, {
      jobId,
      priority: Number(config?.priority || 5),
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    });

    await this.captureDepthMetrics();
    return job;
  }

  static async getRuntimeStats() {
    if (!this.sessionQueue) {
      const emptyCounts = {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      };
      await ScaleMetricsService.recordQueueDepth(this.QUEUE_NAME, emptyCounts);
      return emptyCounts;
    }

    const counts = await this.sessionQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
    await ScaleMetricsService.recordQueueDepth(this.QUEUE_NAME, counts);
    return counts;
  }

  private static async captureDepthMetrics() {
    try {
      await this.getRuntimeStats();
    } catch (error: any) {
      logger.warn('Queue metrics capture failed', { error: error?.message });
    }
  }
}
