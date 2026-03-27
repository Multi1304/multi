
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const account = await prisma.account.findFirst({
    select: { id: true, tenantId: true, username: true }
  });
  console.log('Valid Account:', account);
}

main().catch(console.error).finally(() => prisma.$disconnect());
