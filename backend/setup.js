const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

(async ()=>{
  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.upsert({
      where: { slug: 'dev' },
      update: {},
      create: { name: 'dev-tenant', plan: 'pro', seatsAllowed: -1, slug: 'dev' }
    });
    console.log('TENANT_ID=' + tenant.id);
    const password = 'AdminPass123!';
    const hashed = bcrypt.hashSync(password, 10);
    const user = await prisma.user.upsert({
      where: { email: 'admin@local' },
      update: { password: hashed, role: 'ADMIN', tenantId: tenant.id },
      create: { email: 'admin@local', password: hashed, role: 'ADMIN', tenantId: tenant.id }
    });
    console.log('ADMIN_USER_ID=' + user.id + '  email=admin@local  password=' + password);
    const profile = await prisma.profile.create({ data: { name: 'default', tenantId: tenant.id }});
    const account = await prisma.account.create({ data: { username: 'test_account', password: 'acc-pass', profileId: profile.id, tenantId: tenant.id }});
    console.log('PROFILE_ID=' + profile.id + ' ACCOUNT_ID=' + account.id);
  } catch (e) {
    console.error('ERROR', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
})();
