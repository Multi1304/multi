import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function check() {
  const user = await prisma.user.findFirst({ where: { email: 'admin@local' } });
  if (!user) {
    console.log('User NOT found');
    return;
  }
  const password = 'AdminPass123!';
  const ok = await bcrypt.compare(password, user.password);
  const output = {
    userFound: !!user,
    hashLength: user?.password?.length,
    hashStart: user?.password?.substring(0, 20),
    match: ok,
    bcryptPath: require.resolve('bcryptjs'),
    nodeVersion: process.version
  };
  require('fs').writeFileSync('bcrypt_result.json', JSON.stringify(output, null, 2));
  console.log('DONE: Result written to bcrypt_result.json');
}

check().catch(console.error).finally(() => prisma.$disconnect());
