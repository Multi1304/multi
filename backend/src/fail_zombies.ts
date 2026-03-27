
import { prisma } from './prisma';

async function main() {
  const result = await (prisma.flowRun as any).updateMany({
    where: { status: 'running' },
    data: { 
      status: 'failed',
      error: 'Zombie flow: parent process terminated unexpectedly.',
      completedAt: new Date()
    }
  });
  console.log(`Marked ${result.count} zombie flows as failed.`);
  process.exit(0);
}

main().catch(console.error);
