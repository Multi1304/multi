import { chromium } from 'playwright';
import { logger } from '../src/utils/logger';

async function monitor() {
    logger.info('Starting weekly selector integrity scan...');

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const targets = [
        { name: 'Hotmail Signup', url: 'https://signup.live.com', selector: '#MemberName' },
        { name: 'Spotify Login', url: 'https://accounts.spotify.com/en/login', selector: '#login-username' }
    ];

    for (const target of targets) {
        try {
            await page.goto(target.url, { waitUntil: 'networkidle', timeout: 30000 });
            const exists = await page.$(target.selector);
            if (exists) {
                logger.info(`[PASS] ${target.name} selector "${target.selector}" is healthy.`);
            } else {
                logger.error(`[FAIL] ${target.name} selector "${target.selector}" NOT FOUND! Temple update required.`);
            }
        } catch (err: any) {
            logger.error(`[ERROR] Failed to scan ${target.name}: ${err.message}`);
        }
    }

    await browser.close();
    logger.info('Selector scan completed.');
}

monitor();
