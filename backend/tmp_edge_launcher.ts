import { chromium, Page } from 'playwright';

async function run() {
    console.log('Starting True Edge (Enhanced Resilience)...');
    const browser = await chromium.launch({
        headless: false,
        channel: 'msedge'
    });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0'
    });
    const page = await context.newPage();
    
    async function smartClick(p: Page, selector: string) {
        await p.waitForSelector(selector, { state: 'visible', timeout: 10000 });
        await p.click(selector);
    }

    try {
        await page.goto('https://signup.live.com/signup?lic=1&mkt=es-es');
        console.log('Navigated to Signup.');

        // Email
        await page.fill('input[type="email"]', 'JulianMendez.Victor101@outlook.com');
        await smartClick(page, 'input[type="submit"]');
        console.log('Email submitted.');
        await page.waitForTimeout(3000);

        // Password
        await page.fill('input[type="password"]', 'CamelVictor!2024#Final');
        await smartClick(page, 'input[type="submit"]');
        console.log('Password submitted.');
        await page.waitForTimeout(3000);

        // Names
        await page.fill('input[name="FirstName"]', 'Julian');
        await page.fill('input[name="LastName"]', 'Mendez');
        await smartClick(page, 'input[type="submit"]');
        console.log('Names submitted.');
        await page.waitForTimeout(3000);

        // Birth Date
        // We'll use selectors that are common in the Spanish UI
        await page.selectOption('select[aria-label="Mes"]', '6');
        await page.selectOption('select[aria-label="Día"]', '20');
        await page.fill('input[aria-label="Año"]', '1993');
        await smartClick(page, 'input[type="submit"]');
        console.log('Birthdate submitted.');

        console.log('SUCCESS: Reached CAPTCHA Stage in True Edge.');
    } catch (err) {
        console.error('An error occurred during automation:', err);
    }

    // Keep the browser open for the human to take over
    console.log('Browser is now idling. Solve the CAPTCHA manually.');
    await new Promise(() => {}); // Wait forever
}

run().catch(console.error);
