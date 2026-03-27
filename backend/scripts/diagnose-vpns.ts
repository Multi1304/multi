import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function diagnose() {
  console.log('--- VPN Diagnostic Report V2 ---');
  
  try {
    const totalPools = await prisma.proxyPool.count();
    const totalEndpoints = await prisma.proxyEndpoint.count();
    console.log(`System Totals: ${totalPools} Pools, ${totalEndpoints} Endpoints`);

    const vpnPools = await prisma.proxyPool.findMany({
      where: { type: 'VPN' },
      include: { _count: { select: { endpoints: true } } }
    });

    console.log(`VPN Pools: ${vpnPools.length}`);
    vpnPools.forEach(pool => {
      console.log(`- [POOL] ${pool.name} | Endpoints: ${pool._count.endpoints} | Provider: ${pool.provider}`);
    });

    const vpnEndpoints = await prisma.proxyEndpoint.findMany({
      where: { endpointType: 'VPN' }
    });

    console.log(`VPN Endpoints: ${vpnEndpoints.length}`);
    vpnEndpoints.forEach(ep => {
      console.log(`- [EP] ${ep.host}:${ep.port} | Status: ${ep.status} | Last Error: ${ep.lastError || 'None'}`);
    });

    if (vpnPools.length === 0 && vpnEndpoints.length === 0) {
      console.log('\n[RESULT] No VPN infrastructure found in the database.');
      console.log('Follow-up: Use SelfHostedVpnBootstrapService.ensureSuggestedPools(tenantId) to initialize.');
    }

  } catch (err) {
    console.error('Database Diagnostic Error:', err);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

diagnose();
