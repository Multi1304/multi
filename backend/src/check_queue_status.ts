
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- DATABASE STATUS CHECK ---');
  
  const jobStats = await prisma.jobLog.groupBy({
    by: ['status'],
    _count: { id: true },
  });
  console.log('JobLog Stats:', jobStats);

  const flowRunStats = await prisma.flowRun.groupBy({
    by: ['status'],
    _count: { id: true },
  });
  console.log('FlowRun Stats:', flowRunStats);

  const recentPendingJobs = await prisma.jobLog.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  console.log('Recent Pending Jobs:', recentPendingJobs);

  const recentRunningFlows = await prisma.flowRun.findMany({
    where: { status: 'running' },
    orderBy: { startedAt: 'desc' },
    take: 5,
  });
  console.log('Recent Running Flows:', recentRunningFlows);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
