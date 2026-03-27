import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

async function main() {
  console.log('🏁 Starting CamelFarm Private Egress Bootstrap...');

  try {
    // 1. Start Docker Containers
    console.log('\n📦 Step 1: Starting Local VPN Exit Containers (Docker)...');
    execSync('docker compose -f docker-compose.vpn-local.yml up -d', { stdio: 'inherit' });

    // 2. Bootstrap Pools
    console.log('\n🗄️ Step 2: Initializing VPN Pools in Database...');
    execSync('npx ts-node scripts/bootstrap-vpn-pools.ts', { stdio: 'inherit' });

    // 3. Register Exits
    console.log('\n🖇️ Step 3: Registering Local Exits to Lanes...');
    execSync('npx ts-node scripts/register-local-vpns.ts', { stdio: 'inherit' });

    // 4. Preflight
    console.log('\n🩺 Step 4: Running Preflight Health Checks...');
    execSync('npx ts-node scripts/preflight-vpns.ts', { stdio: 'inherit' });

    console.log('\n✅ CamelFarm Private Egress Pool is now LIVE and OPERATIONAL.');
    console.log('You can now use self-hosted VPN lanes for your profiles.');

  } catch (error) {
    console.error('\n❌ Bootstrap failed. Make sure Docker Desktop is running.');
    process.exit(1);
  }

  process.exit(0);
}

main();
