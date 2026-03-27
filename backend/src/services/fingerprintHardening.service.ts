import { logger } from '../utils/logger';

export interface FingerprintHardeningResult<T = any> {
  fingerprint: T;
  score: number;
  adjustments: string[];
  riskLevel?: 'ready' | 'review' | 'hold';
  blockingIssues?: string[];
}

export class FingerprintHardeningService {
  private static readonly HARDWARE_OPTIONS = [2, 4, 6, 8, 12, 16];
  private static readonly MEMORY_OPTIONS = [2, 4, 8, 16, 32];
  private static readonly TIMEZONES = ['Europe/Madrid', 'Europe/Paris', 'America/New_York', 'America/Chicago', 'America/Los_Angeles'];
  private static readonly LANGUAGE_BY_TIMEZONE: Record<string, string> = {
    'Europe/Madrid': 'es-ES',
    'Europe/Paris': 'fr-FR',
    'America/New_York': 'en-US',
    'America/Chicago': 'en-US',
    'America/Los_Angeles': 'en-US',
  };
  private static readonly DESKTOP_PLUGIN_BASE = ['PDF Viewer', 'Chrome PDF Viewer', 'Chromium PDF Viewer'];
  private static readonly MOBILE_PLUGIN_BASE = ['PDF Viewer'];
  private static readonly DESKTOP_FONT_BASE = ['Arial', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New', 'Trebuchet MS'];
  private static readonly MOBILE_FONT_BASE = ['Arial', 'Verdana', 'Roboto', 'Noto Sans'];
  private static readonly WEBGL_PAIRS = [
    {
      vendor: 'Google Inc. (Intel)',
      renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)',
    },
    {
      vendor: 'Google Inc. (NVIDIA)',
      renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)',
    },
    {
      vendor: 'Google Inc. (AMD)',
      renderer: 'ANGLE (AMD, Radeon RX 580 Series Direct3D11 vs_5_0 ps_5_0)',
    },
    {
      vendor: 'Apple Inc.',
      renderer: 'Apple GPU',
    },
    {
      vendor: 'Qualcomm',
      renderer: 'Adreno (TM) 740',
    },
  ];

  static harden<T extends Record<string, any>>(input?: T | null): FingerprintHardeningResult<T> {
    const fingerprint = { ...(input || {}) } as T;
    const current = fingerprint as any;
    const adjustments: string[] = [];

    const userAgent = String(current.userAgent || '');
    const inferredMobile = Boolean(current.isMobile || /iphone|android|mobile/i.test(userAgent));
    current.isMobile = inferredMobile;

    const viewport = this.normalizeResolution(String(current.screenResolution || ''), inferredMobile);
    if (viewport.changed) adjustments.push(viewport.reason);
    current.screenResolution = viewport.value;

    const hardwareConcurrency = this.nearestAllowed(Number(current.hardwareConcurrency || 0), this.HARDWARE_OPTIONS, inferredMobile ? 8 : 4);
    if (hardwareConcurrency !== Number(current.hardwareConcurrency || 0)) {
      adjustments.push(`Normalized hardwareConcurrency to ${hardwareConcurrency}.`);
    }
    current.hardwareConcurrency = hardwareConcurrency;

    const deviceMemory = this.nearestAllowed(Number(current.deviceMemory || 0), this.MEMORY_OPTIONS, inferredMobile ? 8 : 4);
    if (deviceMemory !== Number(current.deviceMemory || 0)) {
      adjustments.push(`Normalized deviceMemory to ${deviceMemory}.`);
    }
    current.deviceMemory = deviceMemory;

    const normalizedScale = inferredMobile
      ? this.boundNumber(Number(current.deviceScaleFactor || 3), 2, 3)
      : this.boundNumber(Number(current.deviceScaleFactor || 1), 1, 2);
    if (normalizedScale !== Number(current.deviceScaleFactor || 0)) {
      adjustments.push(`Adjusted deviceScaleFactor to ${normalizedScale}.`);
    }
    current.deviceScaleFactor = normalizedScale;

    const maxTouchPoints = inferredMobile ? Math.max(3, Number(current.maxTouchPoints || 5)) : 0;
    if (maxTouchPoints !== Number(current.maxTouchPoints || 0)) {
      adjustments.push(`Adjusted maxTouchPoints to ${maxTouchPoints}.`);
    }
    current.maxTouchPoints = maxTouchPoints;

    const timezoneId = this.TIMEZONES.includes(String(current.timezoneId || current.timezone || ''))
      ? String(current.timezoneId || current.timezone)
      : this.TIMEZONES[0];
    if (timezoneId !== String(current.timezoneId || current.timezone || '')) {
      adjustments.push(`Normalized timezone to ${timezoneId}.`);
    }
    current.timezoneId = timezoneId;

    const derivedLanguage = this.LANGUAGE_BY_TIMEZONE[timezoneId] || (timezoneId.startsWith('Europe/') ? 'en-GB' : 'en-US');
    if (!current.language || this.languageLooksMismatched(String(current.language), timezoneId)) {
      current.language = derivedLanguage;
      adjustments.push(`Aligned language to ${current.language}.`);
    }

    const platformOS = this.normalizePlatformOS(String(current.platformOS || current.platform || ''), userAgent, inferredMobile);
    if (platformOS !== String(current.platformOS || current.platform || '')) {
      adjustments.push(`Normalized platformOS to ${platformOS}.`);
    }
    current.platformOS = platformOS;

    const webgl = this.normalizeWebgl(current.webgl || {}, userAgent, platformOS);
    if (webgl.changed) adjustments.push(webgl.reason);
    current.webgl = webgl.value;

    const normalizedPlugins = this.normalizePlugins(current.plugins, inferredMobile);
    if (normalizedPlugins.changed) adjustments.push(normalizedPlugins.reason);
    current.plugins = normalizedPlugins.value;

    const normalizedFonts = this.normalizeFonts(current.fonts, inferredMobile);
    if (normalizedFonts.changed) adjustments.push(normalizedFonts.reason);
    current.fonts = normalizedFonts.value;

    const blockingIssues = this.detectBlockingIssues(current, userAgent, platformOS, inferredMobile);

    current.validation = current.validation || { score: 0, issues: [] };
    const score = Math.max(0, 100 - Math.min(60, adjustments.length * 8) - Math.min(30, blockingIssues.length * 10));
    const riskLevel: FingerprintHardeningResult['riskLevel'] =
      blockingIssues.length > 0 || score < 70 ? 'hold' : score < 85 ? 'review' : 'ready';
    current.hardening = {
      score,
      adjustments,
      riskLevel,
      blockingIssues,
      normalizedAt: new Date().toISOString(),
    };

    logger.debug('Fingerprint hardened', {
      adjustments: adjustments.length,
      score,
      riskLevel,
      platformOS,
      timezoneId,
    });

    return { fingerprint, score, adjustments, riskLevel, blockingIssues };
  }

  private static normalizeResolution(raw: string, isMobile: boolean) {
    const match = raw.match(/(\d+)\s*x\s*(\d+)/i);
    if (!match) {
      return {
        value: isMobile ? '1080x2400' : '1536x864',
        changed: true,
        reason: 'Applied fallback screen resolution.',
      };
    }

    let width = Number(match[1]);
    let height = Number(match[2]);
    if (isMobile && width > height) {
      [width, height] = [height, width];
      return {
        value: `${width}x${height}`,
        changed: true,
        reason: 'Normalized mobile screen orientation.',
      };
    }
    if (!isMobile && width < 1000) {
      return {
        value: '1536x864',
        changed: true,
        reason: 'Raised desktop resolution to a sane minimum.',
      };
    }
    return { value: `${width}x${height}`, changed: false, reason: '' };
  }

  private static normalizePlatformOS(current: string, userAgent: string, isMobile: boolean) {
    const lower = `${current} ${userAgent}`.toLowerCase();
    if (isMobile && /iphone|ios/.test(lower)) return 'iOS';
    if (isMobile && /android/.test(lower)) return 'Android';
    if (/mac os|macintosh/.test(lower)) return 'macOS';
    if (/linux/.test(lower) && !isMobile) return 'Linux';
    return 'Windows';
  }

  private static normalizeWebgl(current: any, userAgent: string, platformOS: string) {
    const rawVendor = String(current?.vendor || current?.unmaskedVendor || '').toLowerCase();
    let pair = this.WEBGL_PAIRS.find((item) => rawVendor && item.vendor.toLowerCase() === rawVendor);
    if (!pair) {
      if (/iphone|safari|macintosh/i.test(userAgent) || platformOS === 'macOS') {
        pair = this.WEBGL_PAIRS.find((item) => item.vendor === 'Apple Inc.');
      } else if (/android|quest/i.test(userAgent) || platformOS === 'Android') {
        pair = this.WEBGL_PAIRS.find((item) => item.vendor === 'Qualcomm');
      } else {
        pair = this.WEBGL_PAIRS[0];
      }
    }
    const changed =
      current?.vendor !== pair.vendor ||
      current?.renderer !== pair.renderer ||
      current?.unmaskedVendor !== pair.vendor ||
      current?.unmaskedRenderer !== pair.renderer;

    return {
      value: {
        vendor: pair.vendor,
        renderer: pair.renderer,
        unmaskedVendor: pair.vendor,
        unmaskedRenderer: pair.renderer,
      },
      changed,
      reason: changed ? `Aligned WebGL pair to ${pair.vendor}.` : '',
    };
  }

  private static normalizePlugins(current: any, isMobile: boolean) {
    const base = isMobile ? this.MOBILE_PLUGIN_BASE : this.DESKTOP_PLUGIN_BASE;
    const value = Array.isArray(current) && current.length > 0 ? current.slice(0, isMobile ? 2 : 4) : base;
    const changed = JSON.stringify(current || []) !== JSON.stringify(value);
    return {
      value,
      changed,
      reason: changed ? 'Normalized plugin surface for the target device class.' : '',
    };
  }

  private static normalizeFonts(current: any, isMobile: boolean) {
    const base = isMobile ? this.MOBILE_FONT_BASE : this.DESKTOP_FONT_BASE;
    const incoming = Array.isArray(current) ? current.filter((item) => typeof item === 'string' && item.trim().length > 0) : [];
    const merged = Array.from(new Set([...(incoming.length ? incoming : []), ...base])).slice(0, isMobile ? 5 : 8);
    const changed = JSON.stringify(current || []) !== JSON.stringify(merged);
    return {
      value: merged,
      changed,
      reason: changed ? 'Normalized font surface for the target device class.' : '',
    };
  }

  private static languageLooksMismatched(language: string, timezoneId: string) {
    const expected = this.LANGUAGE_BY_TIMEZONE[timezoneId];
    if (!expected) return false;
    return !language.toLowerCase().startsWith(expected.split('-')[0].toLowerCase());
  }

  private static detectBlockingIssues(current: any, userAgent: string, platformOS: string, isMobile: boolean) {
    const issues: string[] = [];
    if (!current.timezoneId) issues.push('Missing timezone.');
    if (!current.language) issues.push('Missing language.');
    if (!current.webgl?.vendor || !current.webgl?.renderer) issues.push('Incomplete WebGL fingerprint.');
    if (!Array.isArray(current.fonts) || current.fonts.length < (isMobile ? 2 : 4)) {
      issues.push('Font surface is too thin.');
    }
    if (!Array.isArray(current.plugins) || current.plugins.length < 1) {
      issues.push('Plugin surface is empty.');
    }
    if (isMobile && !/mobile|iphone|android/i.test(userAgent)) {
      issues.push('Mobile fingerprint without mobile user agent.');
    }
    if (!isMobile && /iphone|android/i.test(userAgent)) {
      issues.push('Desktop fingerprint paired with mobile user agent.');
    }
    if (platformOS === 'macOS' && /windows nt/i.test(userAgent)) {
      issues.push('macOS platform paired with Windows user agent.');
    }
    if (platformOS === 'Windows' && /macintosh/i.test(userAgent)) {
      issues.push('Windows platform paired with macOS user agent.');
    }
    return issues;
  }

  private static nearestAllowed(value: number, allowed: number[], fallback: number) {
    if (!value) return fallback;
    return allowed.reduce((best, candidate) => {
      return Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best;
    }, fallback);
  }

  private static boundNumber(value: number, min: number, max: number) {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, Number(value.toFixed(2))));
  }

  public static getStealthScript(profileId: string, fp: any): string {
    const seedValue = profileId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 100;
    
    return `
      (function() {
        const fp = ${JSON.stringify(fp)};
        const seedValue = ${seedValue};
        
        // --- 1. CORE EVASIONS (WebDriver & CDP) ---
        try {
          const navProto = Object.getPrototypeOf(navigator);
          delete navProto.webdriver;
          Object.defineProperty(navProto, 'webdriver', {
            get: () => undefined,
            enumerable: true,
            configurable: true
          });
        } catch (e) {}

        // --- 2. HARDWARE & ENVIRONMENT MOCKING (V3) ---
        const mockHardProp = (target, prop, value) => {
          try {
            Object.defineProperty(target, prop, {
              get: () => value,
              enumerable: true,
              configurable: true
            });
          } catch (e) {}
        };

        mockHardProp(navigator, 'deviceMemory', fp.deviceMemory || 8);
        mockHardProp(navigator, 'hardwareConcurrency', fp.hardwareConcurrency || 8);
        mockHardProp(navigator, 'platform', fp.platformOS === 'macOS' ? 'MacIntel' : 'Win32');
        mockHardProp(navigator, 'vendor', 'Google Inc.');
        mockHardProp(navigator, 'languages', ['es-ES', 'es', 'en-US', 'en']);

        // --- 2b. NETWORK & PRIVACY HARDENING (V4) ---
        // Block WebRTC (IP Leak protection)
        try {
          const blockWebRTC = (target) => {
            if (target) {
              Object.defineProperty(target.prototype, 'createOffer', { get: () => undefined });
              Object.defineProperty(target.prototype, 'setLocalDescription', { get: () => undefined });
              Object.defineProperty(target.prototype, 'addTransceiver', { get: () => undefined });
            }
          };
          blockWebRTC(window.RTCPeerConnection);
          blockWebRTC(window.webkitRTCPeerConnection);
          blockWebRTC(window.RTCDataChannel);
        } catch (e) {}

        // Battery Mocking
        if (!navigator.getBattery) {
            navigator.getBattery = () => Promise.resolve({
                charging: true,
                chargingTime: 0,
                dischargingTime: Infinity,
                level: 1,
                onchargingchange: null,
                onchargingtimechange: null,
                ondischargingtimechange: null,
                onlevelchange: null
            });
        }

        // Network Mocking
        if (!navigator.connection) {
            navigator.connection = {
                onchange: null,
                effectiveType: '4g',
                rtt: 50,
                downlink: 10,
                saveData: false
            };
        }

        // --- 3. DYNAMIC NOISE INJECTION (Per-Profile) ---
        
        // Canvas Noise: Dynamic per-operation drift
        const toBase64 = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function (...args) {
          const ctx = this.getContext('2d');
          if (ctx) {
            const img = ctx.getImageData(0, 0, 1, 1);
            // Entropy Drift: Add a tiny, non-deterministic drift to avoid consistent fingerprints
            const drift = Math.floor(Math.random() * 2) + 1;
            img.data[0] = Math.max(0, Math.min(255, img.data[0] + ((seedValue + drift) % 5)));
            ctx.putImageData(img, 0, 0);
          }
          return toBase64.apply(this, args);
        };

        // Audio Context Jitter
        const OriginalAudioContext = window.AudioContext || window.webkitAudioContext;
        if (OriginalAudioContext) {
          class StealthAudioContext extends OriginalAudioContext {
            constructor(...args) {
              super(...args);
              const originalCreateAnalyser = this.createAnalyser.bind(this);
              this.createAnalyser = () => {
                const analyser = originalCreateAnalyser();
                const originalGetFloatFrequencyData = analyser.getFloatFrequencyData.bind(analyser);
                analyser.getFloatFrequencyData = (array) => {
                  originalGetFloatFrequencyData(array);
                  if (array.length > 0) array[0] += (seedValue / 1000);
                };
                return analyser;
              };
            }
          }
          window.AudioContext = StealthAudioContext;
          window.webkitAudioContext = StealthAudioContext;
        }

        // --- 4. WEBGL EVASION ---
        if (fp.webgl) {
          const getParam = WebGLRenderingContext.prototype.getParameter;
          WebGLRenderingContext.prototype.getParameter = function (param) {
            const debugInfo = this.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
              if (param === debugInfo.UNMASKED_VENDOR_WEBGL) return fp.webgl.vendor;
              if (param === debugInfo.UNMASKED_RENDERER_WEBGL) return fp.webgl.renderer;
            }
            return getParam.call(this, param);
          };
        }

        // --- 5. DEEP ANTI-FORENSICS (V4.1 Senior Patent) ---
        // Mirror Object.getOwnPropertyDescriptor to hide native overrides
        const originalGetDescriptor = Object.getOwnPropertyDescriptor;
        Object.getOwnPropertyDescriptor = function (target, prop) {
          const descriptor = originalGetDescriptor.apply(this, arguments);
          if (target === navigator && (prop === 'webdriver' || prop === 'deviceMemory' || prop === 'hardwareConcurrency')) {
            return {
              value: target[prop],
              writable: false,
              enumerable: true,
              configurable: true
            };
          }
          return descriptor;
        };

        const oldToString = Function.prototype.toString;
        Function.prototype.toString = function () {
          if (this === Function.prototype.toString) return 'function toString() { [native code] }';
          if (this === Object.getOwnPropertyDescriptor) return 'function getOwnPropertyDescriptor() { [native code] }';
          if (this.name === 'get webdriver' || this.name === 'getBattery' || this.name === 'getParameter' || this.name === 'toDataURL') {
             return \`function \${this.name}() { [native code] }\`;
          }
          return oldToString.call(this);
        };
      })();
    `;
  }
}
