import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- SEEDING V2 FLOW TEMPLATES ---');

    // 1. Get the dev tenant ID
    const tenant = await prisma.tenant.findUnique({ where: { slug: 'dev' } });
    if (!tenant) {
        console.error('Core tenant "dev" not found. Run "node setup.js" first.');
        process.exit(1);
    }

    // 2. Get the admin user ID
    const user = await prisma.user.findFirst({ where: { email: 'admin@local' } });
    if (!user) {
        console.error('Admin user "admin@local" not found. Run "node setup.js" first.');
        process.exit(1);
    }

    const templates = [
        {
            id: 'template-hotmail',
            name: 'Hotmail Account Creator',
            description: 'Automated signup for Outlook/Hotmail identities.',
            isPublic: true,
            steps: [
                { order: 0, type: 'navigate', config: { url: 'https://signup.live.com/signup' } },
                { order: 1, type: 'wait', config: { duration: 2000 } },
                { order: 2, type: 'type', config: { selector: 'input[name="MemberName"]', text: 'camel_farm_test_{{id}}@hotmail.com' } },
                { order: 3, type: 'click', config: { selector: 'input[type="submit"]' } },
                { order: 4, type: 'wait', config: { duration: 1500 } }
            ]
        },
        {
            id: 'template-spotify',
            name: 'Spotify Account Generator',
            description: 'Create Spotify accounts using Hotmail emails.',
            isPublic: true,
            steps: [
                { order: 0, type: 'navigate', config: { url: 'https://www.spotify.com/signup' } },
                { order: 1, type: 'wait', config: { duration: 2000 } },
                { order: 2, type: 'type', config: { selector: '#email', text: 'user@hotmail.com' } },
                { order: 3, type: 'type', config: { selector: '#password', text: 'Pass123!Base' } },
                { order: 4, type: 'click', config: { selector: 'button[type="submit"]' } }
            ]
        },
        {
            id: 'template-youtube',
            name: 'YouTube Engagement Warmup',
            description: 'Watch videos and engage to warm up profiles.',
            isPublic: true,
            steps: [
                { order: 0, type: 'navigate', config: { url: 'https://www.youtube.com' } },
                { order: 1, type: 'wait', config: { duration: 5000 } },
                { order: 2, type: 'click', config: { selector: 'ytd-video-renderer' } },
                { order: 3, type: 'wait', config: { duration: 10000 } }
            ]
        }
    ];

    for (const t of templates) {
        console.log(`Upserting template: ${t.name}`);
        await (prisma as any).flow.upsert({
            where: { id: t.id },
            update: {
                name: t.name,
                description: t.description,
                steps: t.steps,
                isPublic: true
            },
            create: {
                id: t.id,
                name: t.name,
                description: t.description,
                steps: t.steps,
                tenantId: tenant.id,
                userId: user.id,
                isPublic: true
            }
        });
    }

    console.log('V2 Flow templates seeded successfully.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
