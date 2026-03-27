const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

const platforms = [
  'Facebook', 'Instagram', 'TikTok', 'Amazon', 'Gmail', 
  'LinkedIn', 'Spotify', 'Apple Music', 'YouTube', 'Twitter/X', 
  'Reddit', 'Pinterest', 'Discord', 'Twitch'
];

const taskTypes = [
  { type: 'login', suffix: 'Login', action: 'login' },
  { type: 'scrape', suffix: 'Scraper', action: 'scrape' },
  { type: 'action', suffix: 'Action Handler', action: 'action' },
  { type: 'automation', suffix: 'Multi-step Flow', action: 'automation' },
  { type: 'health-check', suffix: 'Status Verifier', action: 'health-check' }
];

async function main() {
  console.log('Cleaning up existing global templates...');
  try {
    const deleted = await prisma.taskTemplate.deleteMany({
      where: { createdBy: 'system' }
    });
    console.log(`Deleted ${deleted.count} old system templates.`);

    console.log('Seeding intelligent templates...');
    for (const platform of platforms) {
      const platformKey = platform.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      for (const task of taskTypes) {
        const jobType = `${platformKey}.${task.action}`;
        const name = `${platform} ${task.suffix}`;
        
        let payload = {};
        if (task.action === 'login') {
          payload = { username: '', password: '', factor2: false };
        } else if (task.action === 'scrape') {
          payload = { url: '', depth: 1, elements: ['profile', 'posts'] };
        } else if (task.action === 'action') {
          payload = { actionType: 'like', targetId: '', comment: '' };
        } else if (task.action === 'automation') {
          payload = { steps: [{ action: 'wait', value: 5000 }, { action: 'navigate', value: 'home' }] };
        } else if (task.action === 'health-check') {
          payload = { checkCookies: true, verifyLastActivity: true };
        }

        let retries = 3;
        while (retries > 0) {
          try {
            await prisma.taskTemplate.create({
              data: {
                tenantId: null,
                name,
                description: `Standard ${platform} ${task.type} template for V1 Commercial operations.`,
                jobType,
                payload,
                createdBy: 'system'
              }
            });
            break; 
          } catch (createErr) {
            retries--;
            if (retries === 0) {
              console.error(`Failed to create template ${name}:`, createErr.message);
            } else {
              console.log(`Retrying template ${name} (${retries} left)...`);
              await new Promise(r => setTimeout(r, 500));
            }
          }
        }
      }
    }
    console.log('Seed completed successfully.');
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
