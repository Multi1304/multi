import { WireguardConfigService } from '../src/services/wireguardConfig.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function sync() {
  console.log('--- Wireguard Master Sync (Private Exits) ---');
  
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'dev' } });
  if (!tenant) process.exit(1);

  console.log('Scanning configs/wireguard/ for .conf files...');
  const result = await WireguardConfigService.syncConfigs(tenant.id);
  
  console.log(result.summary);
  
  if (result.count === 0) {
    console.log('\n[INFO] No .conf files found. Put your personal Wireguard configs in the folder to register them.');
  }

  process.exit(0);
}

sync().catch(console.error);
