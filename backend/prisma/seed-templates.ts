import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

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
  await prisma.taskTemplate.deleteMany({
    where: { createdBy: 'system' }
  });

  console.log('Seeding intelligent templates...');

  for (const platform of platforms) {
    const platformKey = platform.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    for (const task of taskTypes) {
      const jobType = `${platformKey}.${task.action}`;
      const name = `${platform} ${task.suffix}`;
      
      let payload: any = {};
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

      await prisma.taskTemplate.create({
        data: {
          tenantId: null as any,
          name,
          description: `Standard ${platform} ${task.type} template for V1 Commercial operations.`,
          jobType,
          payload,
          createdBy: 'system'
        }
      });
    }
  }

  console.log('Seed completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
