import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function check() {
  console.log('--- WIPING DB FOR CLEAN CERTIFICATION ---');
  const m = prisma as any;
  await m.jobLog.deleteMany();
  await m.auditLog.deleteMany();
  await m.account.deleteMany();
  await m.profile.deleteMany();
  await m.subscription.deleteMany();
  await m.user.deleteMany();
  await m.tenant.deleteMany();
  const count = await m.user.count();
  console.log('✅ DB WIPED SUCCESSFULLY. User count:', count);
}

check().catch(console.error).finally(() => prisma.$disconnect());
