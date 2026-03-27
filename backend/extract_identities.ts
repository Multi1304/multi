import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
const prisma = new PrismaClient();

async function main() {
  const successfulRuns = await (prisma as any).flowRun.findMany({
    where: { status: 'completed' },
    take: 1000,
    orderBy: { createdAt: 'desc' }
  });

  const accounts = await prisma.account.findMany({
    take: 1000,
    orderBy: { createdAt: 'desc' }
  });

  const identities = [
    ...successfulRuns.map((run: any) => ({
      username: run.result?.username,
      password: run.result?.password,
      source: 'flowRun',
      createdAt: run.createdAt
    })),
    ...accounts.map((acc: any) => ({
      username: acc.username,
      password: acc.password,
      source: 'accountTable',
      createdAt: acc.createdAt
    }))
  ]
  .filter((id: any) => id.username && id.password)
  .reduce((acc: any[], current: any) => {
    const x = acc.find(item => item.username === current.username);
    if (!x) return acc.concat([current]);
    else return acc;
  }, [])
  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  console.log(JSON.stringify(identities, null, 2));
  fs.writeFileSync('identity_manifest_v2.json', JSON.stringify(identities, null, 2), 'utf8');

  console.log('\n--- LATEST FLOW RUNS (ANY STATUS) ---');
  const runs = await (prisma as any).flowRun.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
  });
  console.log(JSON.stringify(runs, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
