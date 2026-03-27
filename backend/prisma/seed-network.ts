import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function seed() {
    console.log('--- SEEDING NETWORK TOOLS ---');

    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
        console.log('No tenant found to seed for.');
        return;
    }

    const tenantId = tenant.id;

    // 1. Proxy Pool
    const pool = await (prisma as any).proxyPool.upsert({
        where: { id: 'default-pool' },
        update: {},
        create: {
            id: 'default-pool',
            name: 'Global Premium Pool',
            tenantId,
            type: 'RESIDENTIAL'
        }
    });

    // 2. Proxy Endpoints
    await (prisma as any).proxyEndpoint.upsert({
        where: { id: 'endpoint-1' },
        update: {},
        create: {
            id: 'endpoint-1',
            poolId: pool.id,
            tenantId,
            host: 'proxy.example.com',
            port: 8080,
            username: 'user123',
            password: 'pass123'
        }
    });

    // 3. Network Policies
    await (prisma as any).networkPolicy.upsert({
        where: { id: 'standard-stealth' },
        update: {},
        create: {
            id: 'standard-stealth',
            name: 'Standard Stealth Policy',
            tenantId,
            webrtcMode: 'ALTERED'
        }
    });

    // 4. Fingerprint Presets
    const presets = [
        {
            name: 'Chrome Windows Elite',
            platform: 'OTHER',
            config: {
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                screenResolution: '1920x1080',
                platformOS: 'Windows',
                hardwareConcurrency: 8,
                deviceMemory: 16
            }
        },
        {
            name: 'Safari macOS Stealth',
            platform: 'OTHER',
            config: {
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
                screenResolution: '1440x900',
                platformOS: 'macOS',
                hardwareConcurrency: 4,
                deviceMemory: 8
            }
        }
    ];

    for (const p of presets) {
        await (prisma as any).fingerprintPreset.upsert({
            where: { id: `preset-${p.name.replace(/\s+/g, '-').toLowerCase()}` },
            update: {},
            create: {
                id: `preset-${p.name.replace(/\s+/g, '-').toLowerCase()}`,
                name: p.name,
                platform: p.platform,
                config: p.config,
                tenantId
            }
        });
    }

    console.log('✅ Network Tools seeded successfully!');
}

seed()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
