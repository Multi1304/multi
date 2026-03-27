const { PrismaClient } = require('@prisma/client');

(async () => {
    const prisma = new PrismaClient();
    try {
        const tenantId = 'e1333b95-a362-4197-aaec-1c7a54d05723';
        const userId = 'cf342929-cb58-4911-b782-279bb968f04d';

        const templates = [
            {
                name: 'Hotmail Account Creator',
                description: 'Automated signup flow for Outlook/Hotmail. Required: fresh proxy.',
                steps: [
                    { order: 0, type: 'navigate', config: { url: 'https://outlook.live.com/owa/?nlp=1&signup=1' } },
                    { order: 1, type: 'wait', config: { duration: 2000 } },
                    { order: 2, type: 'type', config: { selector: 'input[name="MemberName"]', text: 'camel_auto_{random}@hotmail.com' } },
                    { order: 3, type: 'click', config: { selector: '#iSignupAction' } },
                    { order: 4, type: 'wait', config: { duration: 1000 } },
                    { order: 5, type: 'type', config: { selector: 'input[name="PasswordInput"]', text: 'SecurePass123!' } },
                    { order: 6, type: 'click', config: { selector: '#iSignupAction' } }
                ]
            },
            {
                name: 'Spotify Account Generator',
                description: 'Creates a new Spotify account. Ideal for music streaming automation.',
                steps: [
                    { order: 0, type: 'navigate', config: { url: 'https://www.spotify.com/signup' } },
                    { order: 1, type: 'wait', config: { duration: 1500 } },
                    { order: 2, type: 'type', config: { selector: '#email', text: 'spotify_{random}@gmail.com' } },
                    { order: 3, type: 'type', config: { selector: '#password', text: 'SpotifyAuto123!' } },
                    { order: 4, type: 'type', config: { selector: '#displayname', text: 'Camel User' } },
                    { order: 5, type: 'click', config: { selector: 'button[type="submit"]' } }
                ]
            },
            {
                name: 'YouTube Engagement Warmup',
                description: 'Navigates YouTube, watches a video and likes it to build session trust.',
                steps: [
                    { order: 0, type: 'navigate', config: { url: 'https://www.youtube.com' } },
                    { order: 1, type: 'wait', config: { duration: 3000 } },
                    { order: 2, type: 'click', config: { selector: 'ytd-rich-grid-media' } },
                    { order: 3, type: 'wait', config: { duration: 15000 } },
                    { order: 4, type: 'click', config: { selector: 'button[aria-label="like this video along with 1,000,000 other people"]' } }
                ]
            }
        ];

        for (const t of templates) {
            await prisma.flow.create({
                data: {
                    name: t.name,
                    description: t.description,
                    steps: t.steps,
                    tenantId,
                    userId,
                    isPublic: true
                }
            });
        }

        console.log('Seeded 3 V2 Flow Templates.');
    } catch (e) {
        console.error('ERROR SEEDING V2 FLOWS:', e);
    } finally {
        await prisma.$disconnect();
    }
})();
