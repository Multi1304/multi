const { chromium } = require('playwright');

async function run() {
    const browser = await chromium.launch({
        headless: false,
        channel: 'msedge'
    });
    
    // FINGERPRINT PAYLOAD
    const fp = {
        timezoneId: 'Europe/Madrid',
        canvasNoise: { r: 1, g: 1, b: 1, a: 1 },
        webglVendor: 'Google Inc. (NVIDIA)',
        webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0)',
        screenWidth: 1920,
        screenHeight: 1080,
        hardwareConcurrency: 8,
        deviceMemory: 8,
        platformOS: 'Win32'
    };

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'es-ES',
        timezoneId: 'Europe/Madrid'
    });

    // --- GHOST PROTOCOL (The "Indetectable" Layer) ---
    await context.addInitScript((fp) => {
        // 1. Webdriver Evasion
        const navigatorProto = Object.getPrototypeOf(navigator);
        delete navigatorProto.webdriver;
        Object.defineProperty(navigatorProto, 'webdriver', { get: () => undefined, enumerable: true, configurable: true });

        // 2. Chrome Object
        if (!window.chrome) {
          window.chrome = {
            app: { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, getDetails: () => null, getIsInstalled: () => false },
            runtime: { OnInstalledReason: { INSTALL: 'install' }, getManifest: () => ({}), getURL: (s) => s },
            loadTimes: () => ({ requestTime: Date.now()/1000 - 0.5, startLoadTime: Date.now()/1000 - 0.5 }),
            csi: () => ({ startE: Date.now(), onloadT: Date.now() + 100 })
          };
        }

        // 3. Plugins
        Object.defineProperty(navigator, 'plugins', { get: () => ({ length: 3, 0: { name: 'PDF Viewer' }, 1: { name: 'Chrome PDF Viewer' }, 2: { name: 'Chromium PDF Viewer' }, item: (i) => [{},{},{}][i], namedItem: (n) => ({}) }) });

        // 4. Hardware
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
        Object.defineProperty(navigator, 'languages', { get: () => ['es-ES', 'es', 'en-US', 'en'] });
        Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });

        // 5. Anti-Forensics
        const oldToString = Function.prototype.toString;
        Function.prototype.toString = function () {
          if (this === Function.prototype.toString) return 'function toString() { [native code] }';
          return oldToString.call(this);
        };

        // 6. Canvas Noise (Injecting subtle noise to break hashing)
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function (...args) {
          const ctx = this.getContext('2d');
          if (ctx) {
            const imageData = ctx.getImageData(0, 0, this.width, this.height);
            for (let i = 0; i < imageData.data.length; i += 4) {
                imageData.data[i] = Math.max(0, Math.min(255, imageData.data[i] + 1));
            }
            ctx.putImageData(imageData, 0, 0);
          }
          return originalToDataURL.apply(this, args);
        };

        // 7. WebGL Evasion
        const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function (param) {
          const debugInfo = this.getExtension('WEBGL_debug_renderer_info');
          if (debugInfo) {
            if (param === debugInfo.UNMASKED_VENDOR_WEBGL) return 'Google Inc. (NVIDIA)';
            if (param === debugInfo.UNMASKED_RENDERER_WEBGL) return 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0)';
          }
          return originalGetParameter.call(this, param);
        };
    }, fp);

    const page = await context.newPage();
    
    console.log('--- WARMING SESSION ON BING ---');
    await page.goto('https://www.bing.com');
    await page.waitForTimeout(3000);
    
    try {
        await page.click('#bnp_btn_accept').catch(() => {}); // Accept cookies
        await page.fill('textarea[name="q"], input[name="q"]', 'crear cuenta outlook gratis');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(4000);

        console.log('--- TRANSITIONING TO SIGNUP ---');
        await page.goto('https://signup.live.com/signup?lic=1&mkt=es-es');

        const email = `Julian.Mendez.Victory.${Math.floor(Math.random()*9999)}@outlook.com`;
        console.log(`Target Email: ${email}`);

        await page.fill('input[type="email"]', email);
        await page.click('input[type="submit"]');
        await page.waitForTimeout(2000);

        await page.fill('input[type="password"]', 'CamelVictor!2024#Ghost');
        await page.click('input[type="submit"]');
        await page.waitForTimeout(2000);

        await page.fill('input[name="FirstName"]', 'Julian');
        await page.fill('input[name="LastName"]', 'Mendez');
        await page.click('input[type="submit"]');
        await page.waitForTimeout(3000);

        await page.selectOption('select[name="BirthDay"]', '20');
        await page.selectOption('select[name="BirthMonth"]', '6');
        await page.fill('input[name="BirthYear"]', '1993');
        await page.click('input[type="submit"]');

        console.log('--- READY FOR HUMAN RESOLUTION ---');
        console.log('Check the visible Microsoft Edge window.');
        
    } catch (e) {
        console.error('Flow failed:', e.message);
    }
}

run();
