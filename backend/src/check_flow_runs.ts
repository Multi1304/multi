
import { prisma } from './prisma';

async function main() {
  const counts = await (prisma.flowRun as any).groupBy({
    by: ['status'],
    _count: { _all: true }
  });
  console.log('FlowRun counts by status:', counts);
  process.exit(0);
}

main().catch(console.error);
