
import { Queue } from 'bullmq';

async function inspect(port: number) {
  console.log(`--- INSPECTING REDIS ON PORT ${port} ---`);
  const queue = new Queue('automation', {
    connection: { host: '127.0.0.1', port }
  });

  const waiting = await queue.getWaiting();
  const active = await queue.getActive();
  const delayed = await queue.getDelayed();
  const jobs = await queue.getJobs(['waiting', 'active', 'delayed', 'completed', 'failed']);

  console.log(`Port ${port}: ${waiting.length} waiting, ${active.length} active, ${delayed.length} delayed`);
  if (waiting.length > 0) {
    console.log('Sample waiting job names:', waiting.slice(0, 3).map(j => j.name));
  }
  
  await queue.close();
}

async function main() {
  await inspect(6379);
  await inspect(6380);
}

main().catch(console.error);
