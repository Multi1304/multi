import { Queue, QueueEvents } from 'bullmq';
import { config } from '../config';
import { logger } from '../utils/logger';

const connection = {
  host: config.redis.host,
  port: config.redis.port,
};

export const automationQueue = new Queue('automation', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 1000, age: 24 * 3600 },
    removeOnFail: { count: 5000, age: 7 * 24 * 3600 },
  },
});

export const queueEvents = new QueueEvents('automation', { connection });

queueEvents.on('completed', ({ jobId }) => {
  logger.debug('Queue event: job completed', { jobId });
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  logger.warn('Queue event: job failed', { jobId, failedReason });
});

import { prisma } from '../prisma';

export async function enqueueJob(
  accountId: string,
  jobType: string,
  payload: any,
  tenantId: string,
) {
  const job = await automationQueue.add(jobType, {
    accountId,
    tenantId,
    payload,
  });

  // Create JobLog immediately so it can be tracked
  await prisma.jobLog.create({
    data: {
      id: job.id!,
      tenantId: tenantId || 'unknown',
      accountId,
      type: jobType,
      status: 'pending',
    }
  });

  logger.info('Job enqueued and log created', { jobId: job.id, jobType, accountId, tenantId });
  return job;
}
