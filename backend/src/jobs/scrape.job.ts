import { Job } from 'bullmq';
import { prisma } from '../prisma';
import { launchBrowser, closeBrowser, BrowserProfileConfig } from '../adapters/playwright.adapter';
import { logger } from '../utils/logger';

const log = logger.child({ service: 'job:scrape' });

/**
 * scrape job handler.
 * Navigates to URL and extracts data using CSS selectors.
 */
export async function scrapeHandler(job: Job): Promise<any> {
  const { accountId, payload } = job.data;
  const { url, selectors, waitFor } = payload || {};

  if (!url) throw new Error('payload.url is required for scrape');

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

  log.info('Starting scrape', { accountId, url });

  const { browser, context, page } = await launchBrowser(profileConfig);

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    if (waitFor) {
      await page.waitForSelector(waitFor, { timeout: 10000 }).catch(() => {});
    }

    const data: Record<string, any> = {};

    // Extract text content from each selector
    if (selectors && typeof selectors === 'object') {
      for (const [key, selector] of Object.entries(selectors)) {
        try {
          const elements = await page.$$(selector as string);
          if (elements.length === 1) {
            data[key] = await elements[0].textContent();
          } else {
            data[key] = await Promise.all(elements.map((el: any) => el.textContent()));
          }
        } catch {
          data[key] = null;
        }
      }
    } else {
      // If no selectors, return page text content
      data.text = await page.textContent('body');
      data.title = await page.title();
    }

    await closeBrowser(profile.id, browser, context);

    return { status: 'scraped', url, data };
  } catch (err: any) {
    await browser.close();
    throw err;
  }
}
