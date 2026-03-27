import { chromium, devices } from 'playwright';

async function run() {
    console.log('--- 🚀 EXPERT RECOVERY: MOBILE-BYPASS (iPhone 15) ---');
    const iPhone15 = devices['iPhone 15 Pro'];
    
    const browser = await chromium.launch({
        channel: 'msedge', // Still use Edge engine but on mobile
        headless: false
    });

    const context = await browser.newContext({
        ...iPhone15,
        locale: 'es-ES',
        timezoneId: 'Europe/Madrid',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
    });

    const page = await context.newPage();
    
    // Human-Like Jitter (Expressive)
    const humanDelay = (ms: number) => new Promise(res => setTimeout(res, ms + Math.random() * 500));

    try {
        console.log('Navigating to Mobile Signup...');
        await page.goto('https://signup.live.com/signup?lic=1&mkt=es-es');
        await humanDelay(2000);

        const email = `Mendez.Julian.Mobile.${Date.now().toString().slice(-4)}@outlook.com`;
        console.log(`Target Email: ${email}`);

        await page.fill('input[type="email"]', email);
        await humanDelay(1500);
        await page.click('input[type="submit"]');
        await humanDelay(3000);

        await page.fill('input[type="password"]', 'CamelVictor!2024#Mobile');
        await humanDelay(1500);
        await page.click('input[type="submit"]');
        await humanDelay(3000);

        await page.fill('input[name="FirstName"]', 'Julian');
        await humanDelay(1000);
        await page.fill('input[name="LastName"]', 'Mendez');
        await humanDelay(1500);
        await page.click('input[type="submit"]');
        await humanDelay(3000);

        // Birth fields (Mobile often uses different layouts)
        console.log('Filling Birthdate (Mobile Flow)...');
        await page.selectOption('select[aria-label="Mes"], select[name="BirthMonth"]', '6');
        await humanDelay(1000);
        await page.selectOption('select[aria-label="Día"], select[name="BirthDay"]', '20');
        await humanDelay(1000);
        await page.fill('input[aria-label="Año"], input[name="BirthYear"]', '1993');
        await humanDelay(1500);
        await page.click('input[type="submit"]');

        console.log('SUCCESS: Mobile Signup reached the verification checkpoint.');
    } catch (err) {
        console.error('Expert Flow Error:', err);
    }

    console.log('### READY FOR MOBILE HUMAN RESOLUTION ###');
    await new Promise(() => {}); // Keep alive
}

run().catch(console.error);
