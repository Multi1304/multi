
import { Queue } from 'bullmq';

async function main() {
  const queue = new Queue('automation', {
    connection: { host: '127.0.0.1', port: 6380 }
  });

  const states = ['waiting', 'active', 'completed', 'failed', 'delayed', 'paused'];
  for (const state of states) {
    const jobs = await queue.getJobs([state as any]);
    console.log(`State ${state}: ${jobs.length} jobs`);
    if (jobs.length > 0) {
      console.log(` - Sample IDs: ${jobs.slice(0, 5).map(j => j.id).join(', ')}`);
    }
  }

  await queue.close();
  process.exit(0);
}

main().catch(console.error);
