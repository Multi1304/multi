import { PrismaClient } from '@prisma/client';
import { ProxyHealthService } from '../src/services/proxyHealth.service';

const prisma = new PrismaClient();

async function runPreflight() {
  const vpnEndpoints = await prisma.proxyEndpoint.findMany({
    where: { endpointType: 'VPN' }
  });

  console.log(`\n\x1b[1m--- 🩺 CamelFarm VPN Preflight Checklist ---\x1b[0m`);
  
  for (const ep of vpnEndpoints) {
    const result = await ProxyHealthService.preflight(ep as any, { tenantId: ep.tenantId, force: true });
    
    const icon = result.ok ? '\x1b[32m[OK]\x1b[0m' : '\x1b[31m[FAIL]\x1b[0m';
    const latencyStr = result.latencyMs ? ` | \x1b[36mLatency: ${result.latencyMs}ms\x1b[0m` : '';
    const group = (ep.metadata as any)?.group || 'unassigned';

    console.log(`${icon} \x1b[1m${ep.host}:${ep.port}\x1b[0m (${group})${latencyStr} | Status: ${result.status} ${result.error ? `| Error: ${result.error}` : ''}`);
  }

  console.log(`\n\x1b[1m--- Verification Complete ---\x1b[0m`);
  
  process.exit(0);
}

runPreflight().catch(console.error);
