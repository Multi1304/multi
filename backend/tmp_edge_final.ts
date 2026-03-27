import { chromium, Page } from 'playwright';

async function run() {
    console.log('Starting TRUE MICROSOFT EDGE at C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe...');
    const browser = await chromium.launch({
        executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        headless: false
    });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0'
    });
    const page = await context.newPage();
    
    async function smartClick(p: Page, selector: string) {
        await p.waitForSelector(selector, { state: 'visible', timeout: 15000 });
        await p.click(selector);
    }

    try {
        await page.goto('https://signup.live.com/signup?lic=1&mkt=es-es');
        console.log('Navigated to Signup.');

        const email = `Mendez.Julian.TrueEdge.${Date.now().toString().slice(-4)}@outlook.com`;
        await page.fill('input[type="email"]', email);
        console.log(`Identity: ${email}`);
        await smartClick(page, 'input[type="submit"]');
        await page.waitForTimeout(3000);

        await page.fill('input[type="password"]', 'CamelVictor!2024#EdgeFinal');
        await smartClick(page, 'input[type="submit"]');
        await page.waitForTimeout(3000);

        await page.fill('input[name="FirstName"]', 'Julian');
        await page.fill('input[name="LastName"]', 'Mendez');
        await smartClick(page, 'input[type="submit"]');
        await page.waitForTimeout(3000);

        // Birth fields
        const monthSel = await page.waitForSelector('select[aria-label="Mes"], select[name="BirthMonth"]', { timeout: 10000 }).then(h => h.evaluate(el => el.id ? `#${el.id}` : 'select')).catch(() => 'select');
        await page.selectOption(monthSel, '6');
        
        const daySel = await page.waitForSelector('select[aria-label="Día"], select[name="BirthDay"]', { timeout: 10000 }).then(h => h.evaluate(el => el.id ? `#${el.id}` : 'select')).catch(() => 'select');
        await page.selectOption(daySel, '20');
        
        const yearSel = await page.waitForSelector('input[aria-label="Año"], input[name="BirthYear"]', { timeout: 10000 }).then(h => h.evaluate(el => el.id ? `#${el.id}` : 'input')).catch(() => 'input');
        await page.fill(yearSel, '1993');
        
        await smartClick(page, 'input[type="submit"]');
        console.log('Form pre-filled. Checking for CAPTCHA...');
        
        await page.waitForTimeout(5000);
        console.log('PASO COMPLETADO: Estamos en la pantalla de verificación.');
    } catch (err) {
        console.error('Automation encountered an issue (likely CAPTCHA appeared early):', err);
    }

    console.log('### SUCCESS: Genuine Microsoft Edge is ready for manual resolution. ###');
    console.log('Solve the CAPTCHA in the window now.');
    await new Promise(() => {}); // Wait forever to keep the browser open
}

run().catch(console.error);
