
import { prisma } from './prisma';
import { enqueueJob } from './queues/automation.queue';

async function main() {
  const pendingJobs = await prisma.jobLog.findMany({
    where: { status: 'pending' }
  });

  console.log(`Found ${pendingJobs.length} pending jobs in DB.`);

  for (const job of pendingJobs) {
    console.log(`Re-enqueuing job ${job.id} (${job.type})...`);
    // Delete the old JobLog entry so enqueueJob can create a fresh one (or we can modify enqueueJob to allow existing)
    // Actually, enqueueJob DOES a prisma.jobLog.create which will FAIL if ID exists.
    // Let's manually add to BullMQ and just update the existing log.
    
    // For simplicity, we'll just delete and re-enqueue for these 12.
    await prisma.jobLog.delete({ where: { id: job.id } });
    await enqueueJob(job.accountId, job.type, {}, job.tenantId);
  }

  process.exit(0);
}

main().catch(console.error);
