import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting rehash of Account passwords...');
  const accounts = await prisma.account.findMany();
  for (const acc of accounts) {
    if (!acc.password || acc.password.length >= 60) {
      console.log(`Skipping ${acc.id} (already hashed or empty)`);
      continue;
    }
    const hashed = await bcrypt.hash(acc.password, 10);
    await prisma.account.update({
      where: { id: acc.id },
      data: { password: hashed },
    });
    console.log(`Rehashed account ${acc.id}`);
  }
  console.log('Done. Disconnecting...');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
