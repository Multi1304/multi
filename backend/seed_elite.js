const { PrismaClient } = require('@prisma/client');

async function seed() {
    const prisma = new PrismaClient();
    try {
        const tenant = await prisma.tenant.findUnique({ where: { slug: 'dev' } });
        const user = await prisma.user.findUnique({ where: { email: 'admin@local' } });

        if (!tenant || !user) {
            console.error('Tenant or User not found. Run setup.js first.');
            return;
        }

        const prototypes = [
            {
                name: 'Outlook/Hotmail Master',
                description: 'Elite creator with robust error handling and domain selection.',
                isPublic: true,
                steps: [
                    { type: 'navigate', config: { url: 'https://signup.live.com/' } },
                    { type: 'waitForSelector', config: { selector: 'input[name="MemberName"]', timeout: 30000 } },
                    { type: 'type', config: { selector: 'input[name="MemberName"]', text: 'multitest.alpha{{random}}@outlook.com' } },
                    { type: 'click', config: { selector: '#idSIButton9' } },
                    { type: 'wait', config: { duration: 2000 } }
                ]
            },
            {
                name: 'Instagram Engagement',
                description: 'Simulate mobile scrolling, likes and bio updates.',
                isPublic: true,
                steps: [
                    { type: 'navigate', config: { url: 'https://www.instagram.com/' } },
                    { type: 'wait', config: { duration: 3000 } },
                    { type: 'screenshot', config: { label: 'Home Feed' } }
                ]
            },
            {
                name: 'TikTok Trend Farmer',
                description: 'Video interaction, swipe emulation and metadata spoofing.',
                isPublic: true,
                steps: [
                    { type: 'navigate', config: { url: 'https://www.tiktok.com/' } },
                    { type: 'wait', config: { duration: 5000 } }
                ]
            },
            {
                name: 'YouTube Elite Warmup',
                description: 'Watch, like and subscribe with human-like delays.',
                isPublic: true,
                steps: [
                    { type: 'navigate', config: { url: 'https://www.youtube.com/' } },
                    { type: 'type', config: { selector: 'input#search', text: 'multilogin stealth' } },
                    { type: 'click', config: { selector: 'button#search-icon-legacy' } }
                ]
            },
            {
                name: 'Spotify Playlist Pusher',
                description: 'Stream tracks and follow artists with mobile blending.',
                isPublic: true,
                steps: [
                    { type: 'navigate', config: { url: 'https://open.spotify.com/' } },
                    { type: 'wait', config: { duration: 2000 } }
                ]
            },
            {
                name: 'FB Ads Trust Builder',
                description: 'Build account trust with organic newsfeed engagement.',
                isPublic: true,
                steps: [
                    { type: 'navigate', config: { url: 'https://www.facebook.com/' } },
                    { type: 'wait', config: { duration: 3000 } }
                ]
            },
            {
                name: 'X Social Threader',
                description: 'Create threads and engage with viral hashtags.',
                isPublic: true,
                steps: [
                    { type: 'navigate', config: { url: 'https://x.com/' } },
                    { type: 'wait', config: { duration: 2000 } }
                ]
            },
            {
                name: 'Web Traffic Elite',
                description: 'Deep path simulation and residential proxy pathing.',
                isPublic: true,
                steps: [
                    { type: 'navigate', config: { url: 'https://google.com' } },
                    { type: 'type', config: { selector: 'textarea[name="q"]', text: 'multilogin platform automation' } },
                    { type: 'wait', config: { duration: 1500 } }
                ]
            }
        ];

        for (const proto of prototypes) {
            await prisma.flow.create({
                data: {
                    ...proto,
                    tenantId: tenant.id,
                    userId: user.id,
                    steps: proto.steps
                }
            });
            console.log(`Prototype loaded: ${proto.name}`);
        }

        console.log('All 8 Elite Prototypes successfully loaded into CamelFarm.');
    } catch (e) {
        console.error('Seed error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

seed();
