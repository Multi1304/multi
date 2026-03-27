import { Job } from 'bullmq';
import { prisma } from '../prisma';
import { launchBrowser, closeBrowser, BrowserProfileConfig } from '../adapters/playwright.adapter';
import { logger } from '../utils/logger';

const log = logger.child({ service: 'job:login_check' });

/**
 * login_check job handler.
 * Opens a browser with the account's profile, navigates to target URL,
 * and checks if the user appears to be logged in.
 */
export async function loginCheckHandler(job: Job): Promise<any> {
  const { accountId, tenantId, payload } = job.data;
  const url = payload?.url || 'https://example.com';
  const selectors = payload?.selectors || {};

  // Load profile config from DB
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

  log.info('Starting login_check', { accountId, profileId: profile.id, url });

  const { browser, context, page } = await launchBrowser(profileConfig);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Check for login indicators
    let isLoggedIn = false;
    const loggedInSelector = selectors.loggedIn || '[data-logged-in], .user-avatar, .account-menu, .dashboard';
    const loggedOutSelector = selectors.loggedOut || '[data-login-form], .login-button, input[type="password"]';

    try {
      const loggedInEl = await page.$(loggedInSelector);
      const loggedOutEl = await page.$(loggedOutSelector);
      isLoggedIn = !!loggedInEl && !loggedOutEl;
    } catch {
      isLoggedIn = false;
    }

    const title = await page.title();

    await closeBrowser(profile.id, browser, context);

    return {
      status: isLoggedIn ? 'logged_in' : 'logged_out',
      url,
      title,
      accountId,
      profileId: profile.id,
    };
  } catch (err: any) {
    await browser.close();
    throw err;
  }
}
