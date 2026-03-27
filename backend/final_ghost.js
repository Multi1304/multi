const { chromium } = require('playwright');

async function run() {
    console.log('--- 🛡️ FINAL GHOST PROTOCOL (v10.0) ---');
    
    const browser = await chromium.launch({
        headless: false,
        channel: 'msedge'
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
        locale: 'es-ES',
        timezoneId: 'Europe/Madrid'
    });

    // --- THE GHOST OVERRIDE (300 Lines of Stealth) ---
    await context.addInitScript(() => {
        // 1. Webdriver
        const nav = Object.getPrototypeOf(navigator);
        delete nav.webdriver;
        Object.defineProperty(nav, 'webdriver', { get: () => undefined, enumerable: true, configurable: true });

        // 2. Plugins & Languages
        Object.defineProperty(navigator, 'plugins', { get: () => [{ name: 'PDF Viewer' }, { name: 'Chrome PDF Viewer' }] });
        Object.defineProperty(navigator, 'languages', { get: () => ['es-ES', 'es', 'en-US', 'en'] });
        Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });

        // 3. Hardware
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });

        // 4. WebGL/Canvas Noise
        const getParam = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(p) {
            if (p === 37445) return 'Google Inc. (NVIDIA)';
            if (p === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0)';
            return getParam.apply(this, arguments);
        };
        
        const toBase64 = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function() {
            const ctx = this.getContext('2d');
            if (ctx) {
                const img = ctx.getImageData(0,0,1,1);
                img.data[0] = img.data[0] + 1;
                ctx.putImageData(img, 0, 0);
            }
            return toBase64.apply(this, arguments);
        };
    });

    const page = await context.newPage();
    
    // Warmup
    console.log('Phase 1: Warming session...');
    await page.goto('https://www.bing.com');
    await page.waitForTimeout(4000);
    
    // Cleanup/Accept
    await page.click('#bnp_btn_accept').catch(() => {});

    // Search
    await page.fill('input[name="q"], textarea[name="q"]', 'outlook signup');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);

    // Registration
    console.log('Phase 2: Navigating to Hotmail...');
    await page.goto('https://signup.live.com/signup?lic=1&mkt=es-es');
    
    const email = `Julian.Mendez.Victory.${Math.floor(Math.random()*9000)}@outlook.com`;
    console.log(`Target: ${email}`);

    // Email
    await page.fill('input[type="email"]', email);
    await page.click('input[type="submit"]');
    await page.waitForTimeout(2000);

    // Password
    await page.fill('input[type="password"]', 'CamelVictor!2024#');
    await page.click('input[type="submit"]');
    await page.waitForTimeout(2000);

    // Names
    await page.fill('input[name="FirstName"]', 'Julian');
    await page.fill('input[name="LastName"]', 'Mendez');
    await page.click('input[type="submit"]');

    console.log('--- READY FOR HUMAN RESOLUTION ---');
}

run();
