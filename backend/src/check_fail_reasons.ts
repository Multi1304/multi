
import { Queue } from 'bullmq';

async function main() {
  const queue = new Queue('automation', {
    connection: { host: '127.0.0.1', port: 6380 }
  });

  const failedJobs = await queue.getJobs(['failed']);
  console.log(`Total failed: ${failedJobs.length}`);

  for (const job of failedJobs.slice(0, 5)) {
    console.log(`--- Job ID ${job.id} (${job.name}) ---`);
    console.log(`Data: ${JSON.stringify(job.data)}`);
    console.log(`Reason: ${job.failedReason}`);
  }

  await queue.close();
  process.exit(0);
}

main().catch(console.error);
