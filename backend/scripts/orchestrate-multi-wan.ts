import { MultiWanManagerService } from '../src/services/multiWanManager.service';
import { SelfHostedVpnBootstrapService } from '../src/services/selfHostedVpnBootstrap.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function orchestrate() {
  console.log('--- Multi-WAN Orchestration (Local Hardware) ---');
  
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'dev' } });
  if (!tenant) process.exit(1);

  const interfaces = await MultiWanManagerService.listPhysicalInterfaces();
  const wans = interfaces.filter(i => i.isWanCandidate);
  
  console.log(`Detected ${wans.length} physical WAN candidate(s):`);
  wans.forEach(i => console.log(`- [${i.name}] ${i.description} | IP: ${i.ipAddress || 'NONE'}`));

  if (wans.length < 2) {
    console.log('\n[!] Only one WAN detected. To have distinct IPs per lane, please connect more Dongles or Routers.');
  }

  const suggestion = await MultiWanManagerService.suggestLaneBinding();
  console.log('\nSuggested Lane Binding:');
  console.log(JSON.stringify(suggestion, null, 2));

  // Registering local exits with interface binding
  const exits = [
    { name: 'local-wan-1', host: 'localhost', port: 1081, group: 'stable_internal', localInterfaceBinding: suggestion.stable_internal },
    { name: 'local-wan-2', host: 'localhost', port: 1082, group: 'geo_sensitive', localInterfaceBinding: suggestion.geo_sensitive },
  ];

  console.log('\nApplying interface binding to Camel...');
  const result = await SelfHostedVpnBootstrapService.registerExits(tenant.id, exits as any);
  console.log(result.summary);

  process.exit(0);
}

orchestrate().catch(console.error);
