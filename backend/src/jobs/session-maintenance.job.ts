import { Job } from 'bullmq';
import { prisma } from '../prisma';
import { launchBrowser, closeBrowser, BrowserProfileConfig } from '../adapters/playwright.adapter';
import { logger } from '../utils/logger';

const log = logger.child({ service: 'job:session_maintenance' });

/**
 * session_maintenance job handler.
 * Opens browser with profile and performs warmup actions to keep session alive.
 */
export async function sessionMaintenanceHandler(job: Job): Promise<any> {
  const { accountId, payload } = job.data;
  const urls = payload?.urls || ['https://www.google.com'];

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { profile: true },
  });
  if (!account) throw new Error(`Account not found: ${accountId}`);

  const profile = account.profile;
  const profileConfig: BrowserProfileConfig = {
    profileId: profile.id,
    proxy: profile.proxyConfig as any,
    timezone: profile.timezone || undefined,
    locale: profile.locale || undefined,
    geolocation: profile.geolocation as any,
    userAgent: (profile.fingerprint as any)?.userAgent,
    webrtc: profile.webrtc as any,
    fingerprint: profile.fingerprint as any,
  };

  log.info('Starting session_maintenance', { accountId, urls });

  const { browser, context, page } = await launchBrowser(profileConfig);

  try {
    const results: any[] = [];

    for (const url of urls) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        // Simulate human-like behavior
        await page.waitForTimeout(2000 + Math.random() * 3000);
        // Scroll down
        await page.evaluate(() => window.scrollBy(0, Math.random() * 500));
        await page.waitForTimeout(1000 + Math.random() * 2000);

        results.push({ url, status: 'ok', title: await page.title() });
      } catch (err: any) {
        results.push({ url, status: 'error', error: err.message });
      }
    }

    await closeBrowser(profile.id, browser, context);

    return { status: 'session_maintained', accountId, profileId: profile.id, results };
  } catch (err: any) {
    await browser.close();
    throw err;
  }
}
