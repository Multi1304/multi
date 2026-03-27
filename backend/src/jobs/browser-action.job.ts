import { Job } from 'bullmq';
import { prisma } from '../prisma';
import { launchBrowser, closeBrowser, BrowserProfileConfig } from '../adapters/playwright.adapter';
import { logger } from '../utils/logger';
import { NetworkRoutingService } from '../services/networkRouting.service';

const log = logger.child({ service: 'job:browser_action' });

/**
 * browser_action job handler.
 * Executes a user-provided script in a browser context.
 */
export async function browserActionHandler(job: Job): Promise<any> {
  const { accountId, payload } = job.data;
  const { url, script, action } = payload || {};

  if (!url) throw new Error('payload.url is required for browser_action');

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { profile: { include: { proxyPool: true, networkPolicy: true } } },
  });
  if (!account) throw new Error(`Account not found: ${accountId}`);

  const profile = account.profile;
  const profileGeo = (profile.geolocation || {}) as any;
  const routing = await NetworkRoutingService.resolve({
    tenantId: profile.tenantId,
    profileId: profile.id,
    profile,
    proxyEndpointId: account.proxyEndpointId || null,
    sticky: true,
    country: profileGeo.country || profileGeo.countryCode || null,
    city: profileGeo.city || null,
    platform: profile.platform || null,
  });

  const profileConfig: BrowserProfileConfig = {
    profileId: profile.id,
    proxy: (routing.proxy || profile.proxyConfig) as any,
    timezone: profile.timezone || undefined,
    locale: profile.locale || undefined,
    geolocation: profile.geolocation as any,
    userAgent: (profile.fingerprint as any)?.userAgent,
    webrtc: profile.webrtc as any,
    fingerprint: profile.fingerprint as any,
  };

  log.info('Starting browser_action', { accountId, url, action });

  const { browser, context, page } = await launchBrowser(profileConfig);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    let result: any = { status: 'completed', action };

    // Execute script if provided
    if (script) {
      result.scriptResult = await page.evaluate(script);
    }

    // Perform named actions
    if (action === 'screenshot') {
      const buffer = await page.screenshot({ fullPage: true });
      result.screenshotSize = buffer.length;
    } else if (action === 'click' && payload.selector) {
      await page.click(payload.selector);
      result.clicked = payload.selector;
    } else if (action === 'fill' && payload.selector && payload.value) {
      await page.fill(payload.selector, payload.value);
      result.filled = payload.selector;
    } else if (action === 'wait') {
      await page.waitForTimeout(payload.duration || 3000);
      result.waited = payload.duration || 3000;
    }

    result.title = await page.title();

    if (routing.endpoint?.id) {
      await NetworkRoutingService.reportEndpointSuccess(routing.endpoint.id).catch(() => null);
    }
    await closeBrowser(profile.id, browser, context);
    return result;
  } catch (err: any) {
    if (routing.endpoint?.id) {
      await NetworkRoutingService.reportEndpointFailure(profile.tenantId, routing.endpoint.id, err?.message || 'browser_action_failed', profile.id).catch(() => null);
    }
    await browser.close();
    throw err;
  }
}
