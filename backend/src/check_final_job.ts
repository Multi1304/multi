
import { prisma } from './prisma';

async function main() {
  const job = await prisma.jobLog.findUnique({
    where: { id: '125' }
  });
  console.log('Final Status of Job 125:', job?.status);
  console.log('Metadata:', JSON.stringify(job?.metadata, null, 2));
  process.exit(0);
}

main().catch(console.error);
