
import { prisma } from './prisma';

async function main() {
  const runningRuns = await (prisma.flowRun as any).findMany({
    where: { status: 'running' },
    include: { flow: true }
  });
  console.log('Running FlowRuns:', JSON.stringify(runningRuns, null, 2));
  process.exit(0);
}

main().catch(console.error);
