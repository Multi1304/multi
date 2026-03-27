import { VpsProvisioningService } from '../src/services/vpsProvisioning.service';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();
const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const host = args[0];
  const user = args[1] || 'root';
  const keyPath = args[2];
  const group = args[3] || 'high_separation';

  if (!host) {
    console.log('--- CamelFarm VPS Provisioner (One-Click VPN) ---');
    console.log('Usage: npx ts-node scripts/provision-vps.ts <IP> [user] [ssh_key_path] [group]');
    console.log('\nRequirements:');
    console.log('1. A clean Ubuntu 20.04/22.04/24.04 VPS.');
    console.log('2. SSH access from this machine.');
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: 'dev' } });
  if (!tenant) {
    console.error('Tenant "dev" not found. Run "npm run db:seed" first.');
    process.exit(1);
  }

  console.log(`🚀 Provisioning ${host} as a private Camel Exit...`);

  try {
    const result = await VpsProvisioningService.provision(tenant.id, {
      host,
      user,
      sshKeyPath: keyPath,
      group,
    });

    console.log('\n✅ Deployment Successful!');
    console.log(`Summary: ${result.summary}`);
    console.log(`Public Key: ${result.pubKey}`);
    console.log('\nThis exit has been registered in the database and is ready for use.');

  } catch (error: any) {
    console.error('\n❌ Deployment failed.');
    console.error(`Reason: ${error.message}`);
    process.exit(1);
  }
}

main().catch(console.error);
