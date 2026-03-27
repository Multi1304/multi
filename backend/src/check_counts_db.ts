
import { prisma } from './prisma';

async function main() {
  const counts = await prisma.jobLog.groupBy({
    by: ['status'],
    _count: { _all: true }
  });
  console.log('Job counts by status:', counts);
  process.exit(0);
}

main().catch(console.error);
