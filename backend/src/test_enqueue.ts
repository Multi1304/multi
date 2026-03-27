
import { enqueueJob } from './queues/automation.queue';
import { prisma } from './prisma';
import { Queue } from 'bullmq';

async function main() {
  const accountId = '309588c3-b7d8-4862-b32c-ec00ce32322a';
  const tenantId = '958bc68c-06ea-4ab9-b8da-2e2a1f26c13a';
  const jobType = 'login_check';
  const payload = { test: true };

  console.log('--- ENQUEUING TEST JOB ---');
  const job = await enqueueJob(accountId, jobType, payload, tenantId);
  console.log('Enqueued Job ID:', job.id);

  const dbJob = await (prisma.jobLog as any).findUnique({ where: { id: job.id! } });
  console.log('DB Job Status:', dbJob?.status);

  const queue = new Queue('automation', {
    connection: { host: '127.0.0.1', port: 6380 }
  });
  const waitingCount = await queue.getWaitingCount();
  console.log('Redis Port 6380 Waiting Count:', waitingCount);
  
  // Also check if worker picked it up
  await new Promise(resolve => setTimeout(resolve, 2000));
  const dbJobAfter = await (prisma.jobLog as any).findUnique({ where: { id: job.id! } });
  console.log('DB Job Status after 2s:', dbJobAfter?.status);

  await queue.close();
  process.exit(0);
}

main().catch(console.error);
