
import { Queue } from 'bullmq';

async function main() {
  const queue = new Queue('automation', {
    connection: { host: '127.0.0.1', port: 6380 }
  });

  const job = await queue.getJob('14');
  if (job) {
    console.log(`--- Job ID ${job.id} (${job.name}) ---`);
    console.log(`Data: ${JSON.stringify(job.data)}`);
    console.log(`State: ${await job.getState()}`);
    console.log(`Reason: ${job.failedReason}`);
  } else {
    console.log('Job 14 not found');
  }

  await queue.close();
  process.exit(0);
}

main().catch(console.error);
