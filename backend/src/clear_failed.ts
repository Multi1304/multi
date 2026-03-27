
import { Queue } from 'bullmq';

async function main() {
  const queue = new Queue('automation', {
    connection: { host: '127.0.0.1', port: 6380 }
  });

  console.log('Clearing failed jobs...');
  await queue.clean(0, 1000, 'failed');
  console.log('Failed jobs cleared.');

  await queue.close();
  process.exit(0);
}

main().catch(console.error);
