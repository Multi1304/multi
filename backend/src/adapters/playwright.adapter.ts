import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { logger } from '../utils/logger';

const log = logger.child({ service: 'playwright-adapter' });

/**
 * Browser profile configuration passed to the adapter.
 */
export interface BrowserProfileConfig {
  profileId: string;
  proxy?: {
    type: 'http' | 'socks5';
    host: string;
    port: number;
    username?: string;
    password?: string;
  };
  timezone?: string;
  locale?: string;
  geolocation?: { latitude: number; longitude: number; accuracy?: number };
  viewport?: { width: number; height: number };
  userAgent?: string;
  webrtc?: 'real' | 'disabled' | 'public_only';
  fingerprint?: Record<string, any>;
}

/**
 * Get the path to the storage state file for a profile.
 */
function getStoragePath(profileId: string): string {
  const dir = path.join(config.profilesDir, profileId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'storage-state.json');
}

/**
 * Launch a browser context configured for the given profile.
 * Returns { browser, context, page } for use in job handlers.
 */
export async function launchBrowser(profileConfig: BrowserProfileConfig) {
  // Dynamic import — playwright may not be available in all environments
  const { chromium } = await import('playwright');

  const storagePath = getStoragePath(profileConfig.profileId);

  // Build launch options
  const launchOptions: any = {
    headless: true,
  };

  // Proxy configuration
  if (profileConfig.proxy) {
    const p = profileConfig.proxy;
    launchOptions.proxy = {
      server: `${p.type === 'socks5' ? 'socks5' : 'http'}://${p.host}:${p.port}`,
    };
    if (p.username) launchOptions.proxy.username = p.username;
    if (p.password) launchOptions.proxy.password = p.password;
  }

  const browser = await chromium.launch(launchOptions);

  // Context options
  const contextOptions: any = {
    viewport: profileConfig.viewport || { width: 1920, height: 1080 },
  };

  // Load persisted storage state if exists
  if (fs.existsSync(storagePath)) {
    contextOptions.storageState = storagePath;
    log.info('Loaded storage state', { profileId: profileConfig.profileId });
  }

  // Locale and timezone
  if (profileConfig.locale) contextOptions.locale = profileConfig.locale;
  if (profileConfig.timezone) contextOptions.timezoneId = profileConfig.timezone;
  if (profileConfig.userAgent) contextOptions.userAgent = profileConfig.userAgent;

  // Geolocation
  if (profileConfig.geolocation) {
    contextOptions.geolocation = profileConfig.geolocation;
    contextOptions.permissions = ['geolocation'];
  }

  const context = await browser.newContext(contextOptions);

  // WebRTC leak prevention via CDP
  if (profileConfig.webrtc === 'disabled') {
    try {
      const cdpSession = await context.newCDPSession(await context.newPage());
      await cdpSession.send('Network.setWebRTCIPHandlingPolicy' as any, {
        webRTCIPHandlingPolicy: 'disable_non_proxied_udp',
      } as any);
      log.info('WebRTC disabled', { profileId: profileConfig.profileId });
    } catch (e: any) {
      log.warn('Could not set WebRTC policy', { error: e.message });
    }
  }

  // Fingerprint injection (canvas, WebGL, fonts, etc.)
  if (profileConfig.fingerprint) {
    await injectFingerprint(context, profileConfig.fingerprint);
  }

  const page = await context.newPage();

  log.info('Browser launched', {
    profileId: profileConfig.profileId,
    proxy: profileConfig.proxy ? `${profileConfig.proxy.host}:${profileConfig.proxy.port}` : 'none',
    timezone: profileConfig.timezone || 'default',
  });

  return { browser, context, page };
}

/**
 * Save the storage state (cookies, localStorage) for a profile.
 */
export async function saveStorageState(profileId: string, context: any) {
  const storagePath = getStoragePath(profileId);
  await context.storageState({ path: storagePath });
  log.info('Storage state saved', { profileId });
}

/**
 * Close browser and save state.
 */
export async function closeBrowser(profileId: string, browser: any, context: any) {
  try {
    await saveStorageState(profileId, context);
  } catch (e: any) {
    log.warn('Failed to save storage state', { profileId, error: e.message });
  }
  await browser.close();
  log.info('Browser closed', { profileId });
}

/**
 * Inject fingerprint overrides into browser context.
 */
async function injectFingerprint(context: any, fingerprint: Record<string, any>) {
  await context.addInitScript((fp: any) => {
    // Override navigator properties
    if (fp.hardwareConcurrency) {
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => fp.hardwareConcurrency });
    }
    if (fp.deviceMemory) {
      Object.defineProperty(navigator, 'deviceMemory', { get: () => fp.deviceMemory });
    }
    if (fp.platform) {
      Object.defineProperty(navigator, 'platform', { get: () => fp.platform });
    }
    if (fp.maxTouchPoints !== undefined) {
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => fp.maxTouchPoints });
    }

    // Canvas fingerprint noise
    if (fp.canvasNoise) {
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (...args: any[]) {
        const ctx = this.getContext('2d');
        if (ctx) {
          const imageData = ctx.getImageData(0, 0, this.width, this.height);
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] = imageData.data[i] ^ (fp.canvasNoise & 0xff);
          }
          ctx.putImageData(imageData, 0, 0);
        }
        return origToDataURL.apply(this, args);
      };
    }

    // WebGL vendor/renderer
    if (fp.webglVendor || fp.webglRenderer) {
      const getParameterOrig = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (param: any) {
        const debugInfo = this.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          if (param === debugInfo.UNMASKED_VENDOR_WEBGL && fp.webglVendor) return fp.webglVendor;
          if (param === debugInfo.UNMASKED_RENDERER_WEBGL && fp.webglRenderer) return fp.webglRenderer;
        }
        return getParameterOrig.call(this, param);
      };
    }

    // Screen resolution
    if (fp.screenWidth && fp.screenHeight) {
      Object.defineProperty(screen, 'width', { get: () => fp.screenWidth });
      Object.defineProperty(screen, 'height', { get: () => fp.screenHeight });
      Object.defineProperty(screen, 'availWidth', { get: () => fp.screenWidth });
      Object.defineProperty(screen, 'availHeight', { get: () => fp.screenHeight });
    }
  }, fingerprint);
}
