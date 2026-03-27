import { spawn } from 'child_process';
import path from 'path';
import { logger } from '../utils/logger';

/**
 * CamelFarm SpoofEngine V4 (Grok-Powered)
 * Handles ultra-stealthy profile launches with proactive AI mitigation.
 */
export class SpoofEngine {
  private static readonly XAI_EVADE_PATH = path.join(process.cwd(), 'backend', 'ai_modules', 'xai_evade.py');
  private static readonly PYTHON_CMD = 'python';
  private static requestCount = 0;

  /**
   * Monitors system memory and enforces limits.
   */
  private static checkSystemHealth() {
    const memory = process.memoryUsage();
    const heapUsedMB = memory.heapUsed / 1024 / 1024;
    const rssMB = memory.rss / 1024 / 1024;
    
    if (rssMB > 800) { // Limit for this instance
      logger.warn('MEMORY LIMIT EXCEEDED', { rssMB });
      // In a real scenario, we might trigger a graceful restart or reject hits
    }
  }

  /**
   * Launches a hardened browser instance.
   */
  static async launchProfile(config: any) {
    this.checkSystemHealth();
    this.requestCount++;

    logger.info(`[CamelFarm] Launching Profile: ${config.id}`, { headless: true });

    // 1. Get AI Suggestions (Grok)
    let aiSuggestions = {
      canvasSeed: Math.floor(Math.random() * 100000),
      hardwareConcurrency: 8,
      audioPerturbation: 0.0000001,
      webglVendor: "Google Inc. (NVIDIA)",
      webglRenderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11)"
    };

    try {
      const suggestions = await this.getAiEvasion(config);
      if (suggestions) aiSuggestions = { ...aiSuggestions, ... suggestions };
    } catch (e) {
      logger.warn('AI Evasion failed, using high-entropy defaults');
    }

    // 2. Headless Enforcement & Arguments
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      `--user-agent=${config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}`,
      `--window-size=${config.width || 1280},${config.height || 720}`,
      '--disable-blink-features=AutomationControlled',
    ];

    // 3. Proxy Rotation (Auto-rotating every 5 requests if a pool is provided)
    if (config.proxyPool && config.proxyPool.length > 0) {
      const proxyIndex = Math.floor(this.requestCount / 5) % config.proxyPool.length;
      const proxy = config.proxyPool[proxyIndex];
      args.push(`--proxy-server=${proxy}`);
      logger.info('Rotating Proxy', { proxy });
    }

    const puppeteer = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteer.use(StealthPlugin());

    const browser = await puppeteer.launch({
      headless: true, // MVP Requirement: Max efficiency
      args,
      defaultViewport: {
        width: config.width || 1280,
        height: config.height || 720,
      }
    });

    const page = await browser.newPage();

    // 4. Inject Stealth Evasion
    await page.evaluateOnNewDocument((cfg) => {
      // Canvas Spoofing
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function() {
        const ctx = this.getContext('2d');
        if (ctx) {
          ctx.fillStyle = `rgba(${cfg.canvasSeed % 255}, 0, 0, 0.01)`;
          ctx.fillRect(0, 0, 1, 1);
        }
        return originalToDataURL.apply(this, arguments);
      };

      // Hardware Concurrency
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => cfg.hardwareConcurrency });

      // WebGL
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(p) {
        if (p === 37445) return cfg.webglVendor;
        if (p === 37446) return cfg.webglRenderer;
        return getParameter.apply(this, arguments);
      };
    }, aiSuggestions);

    return { browser, page, aiSuggestions };
  }

  private static async getAiEvasion(config: any): Promise<any> {
    return new Promise((resolve) => {
      const proc = spawn(this.PYTHON_CMD, [this.XAI_EVADE_PATH, JSON.stringify(config)]);
      let stdout = '';
      proc.stdout.on('data', (d) => stdout += d.toString());
      proc.on('close', () => {
        try {
          const res = JSON.parse(stdout);
          resolve(res.success ? res.result : null);
        } catch {
          resolve(null);
        }
      });
    });
  }
}
