import { PrismaClient } from '@prisma/client';
import { SelfHostedVpnBootstrapService } from '../src/services/selfHostedVpnBootstrap.service';

const prisma = new PrismaClient();

async function bootstrap() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'dev' } });
  if (!tenant) {
    console.error('Tenant "dev" not found. Run setup.js first.');
    process.exit(1);
  }

  console.log(`Bootstrapping VPN pools for tenant: ${tenant.name} (${tenant.id})`);
  
  const result = await SelfHostedVpnBootstrapService.ensureSuggestedPools(tenant.id);
  
  console.log(result.summary);
  if (result.createdPools.length > 0) {
    result.createdPools.forEach(p => console.log(`- Created Pool: ${p.name} (Type: ${p.type})`));
  }
  
  process.exit(0);
}

bootstrap().catch(err => {
  console.error(err);
  process.exit(1);
});
