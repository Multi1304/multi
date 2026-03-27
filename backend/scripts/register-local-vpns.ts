import { PrismaClient } from '@prisma/client';
import { SelfHostedVpnBootstrapService } from '../src/services/selfHostedVpnBootstrap.service';

const prisma = new PrismaClient();

async function register() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'dev' } });
  if (!tenant) process.exit(1);

  const localExits = [
    { name: 'local-wg-1', host: 'localhost', port: 1081, group: 'stable_internal', cluster: 'wg-cluster-1', country: 'es' },
    { name: 'local-wg-2', host: 'localhost', port: 1082, group: 'geo_sensitive', cluster: 'wg-cluster-2', country: 'pt' },
    { name: 'local-wg-3', host: 'localhost', port: 1083, group: 'overflow_backup', cluster: 'wg-cluster-3', country: 'es' },
    { name: 'local-wg-4', host: 'localhost', port: 1084, group: 'high_separation', cluster: 'wg-cluster-4', country: 'us' },
  ];

  console.log('Registering 4 local proxy exits as VPN lanes...');
  const result = await SelfHostedVpnBootstrapService.registerExits(tenant.id, localExits);
  console.log(result.summary);
  
  process.exit(0);
}

register().catch(console.error);
