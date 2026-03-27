import { BrowserNodeService } from './src/services/browser.node';
import { logger } from './src/utils/logger';

async function run() {
    process.env.BROWSER_HEADLESS = 'false';
    const profileId = 'victory-' + Date.now();
    
    console.log('--- 🛡️ CAMEL GHOST PROTOCOL ACTIVATED ---');
    
    const page = await BrowserNodeService.createPage(profileId, {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        screenResolution: '1920x1080',
        language: 'es-ES'
    });

    try {
        // 1. Warming
        console.log('Step 1: Warming session (Bing)...');
        await page.goto('https://www.bing.com');
        await page.waitForTimeout(3000);
        await page.fill('input[name="q"], textarea[name="q"]', 'crear cuenta hotmail');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(3000);

        // 2. Signup
        console.log('Step 2: Navigating to Signup...');
        await page.goto('https://signup.live.com/signup?lic=1&mkt=es-es');
        
        const email = `Julian.Mendez.Victory.${Math.floor(Math.random()*9000)}@outlook.com`;
        console.log(`Target: ${email}`);

        // Email
        await page.fill('input[type="email"]', email);
        await page.click('input[type="submit"], #iSignupAction');
        await page.waitForTimeout(2000);

        // Password
        await page.fill('input[type="password"]', 'CamelVictor!2024#');
        await page.click('input[type="submit"], #iSignupAction');
        await page.waitForTimeout(2000);

        // Names
        await page.fill('input[name="FirstName"]', 'Julian');
        await page.fill('input[name="LastName"]', 'Mendez');
        await page.click('input[type="submit"], #iSignupAction');
        await page.waitForTimeout(2000);

        // BirthDate (Manual Buffer)
        console.log('Step 3: Reached BirthDate stage.');
        console.log('--- ACTION REQUIRED ---');
        console.log('Please fill the BirthDate and solve the CAPTCHA in the visible window.');
        
    } catch (e) {
        console.error('Flow Error:', e.message);
    }
}

run();
