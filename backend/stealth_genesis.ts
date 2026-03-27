import { BrowserNodeService } from './src/services/browser.node';
import { logger } from './src/utils/logger';

async function run() {
    process.env.BROWSER_HEADLESS = 'false';
    const profileId = 'stealth-victory-' + Date.now();
    
    logger.info('--- 🚀 GHOST PROTOCOL ACTIVATED ---');
    
    // 1. Create Transparent Page (with Stealth)
    const page = await BrowserNodeService.createPage(profileId, {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        screenResolution: '1920x1080',
        language: 'es-ES'
    });

    try {
        // 2. Warming (Bing)
        logger.info('Step 1: Warming session on Bing...');
        await page.goto('https://www.bing.com', { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);
        
        // Search
        const searchInput = await page.waitForSelector('textarea[name="q"], input[name="q"]');
        await searchInput.type('crear cuenta outlook gratis', { delay: 100 });
        await page.keyboard.press('Enter');
        await page.waitForTimeout(3000);

        // 3. Signup via Link
        logger.info('Step 2: Transitioning to Signup...');
        // Directly go to signup but with the warmed cookies
        await page.goto('https://signup.live.com/signup?lic=1&mkt=es-es', { waitUntil: 'networkidle' });

        // 4. Form Filling (Julian.Mendez.Ghost@outlook.com)
        const email = `Julian.Mendez.Ghost.${Math.floor(Math.random()*9000)}@outlook.com`;
        logger.info(`Target: ${email}`);

        await page.fill('input[type="email"]', email);
        await page.click('input[type="submit"]');
        await page.waitForTimeout(2000);

        await page.fill('input[type="password"]', 'CamelGhost!2024#');
        await page.click('input[type="submit"]');
        await page.waitForTimeout(2000);

        // Names
        await page.fill('input[name="FirstName"]', 'Julian');
        await page.fill('input[name="LastName"]', 'Mendez');
        await page.click('input[type="submit"]');
        await page.waitForTimeout(2000);

        // Birth
        await page.selectOption('select[name="BirthDay"]', '20');
        await page.selectOption('select[name="BirthMonth"]', '6');
        await page.fill('input[name="BirthYear"]', '1993');
        await page.click('input[type="submit"]');

        logger.info('SUCCESS: Reached CAPTCHA checkpoint with Ghost Steatlh.');
        logger.info('Please resolve the puzzle in the visible Edge window.');

    } catch (error) {
        logger.error('Flow failed', { error: (error as Error).message });
    }
}

run();
