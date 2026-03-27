import { chromium } from 'playwright';

async function test() {
    console.log('Testing Edge Launch (Channel: msedge)...');
    try {
        const browser = await chromium.launch({
            channel: 'msedge',
            headless: false
        });
        console.log('SUCCESS: Microsoft Edge launched successfully.');
        const page = await browser.newPage();
        await page.goto('https://www.google.com');
        const ua = await page.evaluate(() => navigator.userAgent);
        console.log('User Agent:', ua);
        await browser.close();
    } catch (err) {
        console.error('FAILED to launch Microsoft Edge:', err);
    }
}

test();
