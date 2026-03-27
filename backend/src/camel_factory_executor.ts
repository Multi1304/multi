import { prisma } from './prisma';
import { logger } from './utils/logger';
import { AiFingerprintService } from './services/aiFingerprint.service';
import { FlowExecutorService } from './services/flow.executor';
import { BrowserNodeService } from './services/browser.node';
import * as fs from 'fs';
import * as path from 'path';

/**
 * V4.58 - Zero-G Autonomous Production Controller
 * Coordinates profile creation, flow execution, and manual verification.
 */
async function runFactory(count: number = 6) {
    const tenantId = '255e61dd-5057-42ae-8ee4-b6ae11e6ead1';
    const userId = '89ec7ceb-036d-4d6d-976d-d44dfd4bd79b';

    logger.info(`--- STARTING ZERO-G AUTONOMOUS FACTORY (${count} ACCOUNTS) ---`);

    // Load the template
    const templatePath = 'C:\\Users\\xazai\\.gemini\\antigravity\\brain\\06005e53-be4c-4e14-9889-ea92a50cc979\\WRAITH_V4_56_HOTMAIL.json.md';
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    const flowData = JSON.parse(templateContent);

    // Upsert the flow into the DB so we can run it
    const flow = await (prisma as any).flow.upsert({
        where: { id: 'wraith-v4-57-hotmail' },
        update: {
            name: 'WRAITH_V4_57_HOTMAIL_AUTONOMOUS',
            steps: flowData.steps
        },
        create: {
            id: 'wraith-v4-57-hotmail',
            tenantId,
            userId,
            name: 'WRAITH_V4_57_HOTMAIL_AUTONOMOUS',
            steps: flowData.steps
        }
    });

    const results = [];

    for (let i = 0; i < count; i++) {
        logger.info(`[FACTORY] Starting session ${i + 1}/${count}...`);

        try {
            // 1. Genesis: Create AI-optimized profile
            const profileName = `ZERO-G_PROD_${Date.now()}_${i + 1}`;
            const fp = AiFingerprintService.generate('WINDOWS');

            const profile = await (prisma.profile as any).create({
                data: {
                    name: profileName,
                    tenantId,
                    userId,
                    platform: 'WINDOWS',
                    fingerprint: fp
                }
            });

            logger.info(`[FACTORY] Genesis complete: Profile ${profile.id}`);

            // 2. Execution: Run the Hotmail flow
            // Note: We'll run it and wait for completion
            const run = await FlowExecutorService.runFlow(flow.id, tenantId, {});

            // Check if successful
            const finalRun = await (prisma as any).flowRun.findUnique({
                where: { id: run.id }
            });

            if (finalRun.status === 'completed' && finalRun.result?.confirmedSuccess) {
                logger.info(`[FACTORY] Flow SUCCESS for session ${i + 1}`);

                // 3. True Victory Verification: Manual Login
                const creds = finalRun.result;
                const email = creds.username.includes('@') ? creds.username : `${creds.username}@hotmail.com`;
                const password = creds.password;

                logger.info(`[FACTORY] Verifying credentials: ${email} / ${password}`);

                const verified = await verifyAccount(email, password, profile.fingerprint);

                if (verified) {
                    logger.info(`[FACTORY] TRUE VICTORY: Account ${email} is verified and active.`);
                    results.push({ email, password, status: 'VERIFIED', profileId: profile.id });

                    // Update account in DB
                    await (prisma.account as any).create({
                        data: {
                            username: email,
                            password: password,
                            profileId: profile.id,
                            tenantId: tenantId,
                            status: 'ACTIVE'
                        }
                    });
                } else {
                    logger.warn(`[FACTORY] LOBBY FAILED for ${email}. Marking as PENDING.`);
                    results.push({ email, password, status: 'PENDING_VERIFICATION', profileId: profile.id });
                }
            } else {
                logger.error(`[FACTORY] Flow FAILED for session ${i + 1}: ${finalRun.error}`);
                results.push({ status: 'FAILED', error: finalRun.error });
            }

        } catch (error: any) {
            logger.error(`[FACTORY] Fatal error in session ${i + 1}`, { error: error.message });
            results.push({ status: 'FATAL_ERROR', error: error.message });
        }

        // Human-like pause between sessions
        await new Promise(r => setTimeout(r, 5000));
    }

    logger.info(`--- FACTORY RUN COMPLETE ---`);
    console.table(results);

    // Save report
    const reportPath = 'C:\\Users\\xazai\\.gemini\\antigravity\\brain\\06005e53-be4c-4e14-9889-ea92a50cc979\\FACTORY_REPORT.json';
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
}

/**
 * Pure Verification Logic: Fresh login into the created account
 */
async function verifyAccount(email: string, password: string, fingerprint: any) {
    let page;
    try {
        page = await BrowserNodeService.createPage(fingerprint);
        logger.info(`[VERIFIER] Attempting fresh login for ${email}...`);

        await page.goto('https://outlook.live.com/owa/?nlp=1', { waitUntil: 'load', timeout: 30000 });

        // 1. Email field
        await page.waitForSelector('input[type="email"]', { timeout: 15000 });
        await page.fill('input[type="email"]', email);
        await page.click('#idSIButton9');

        // 2. Password field
        await page.waitForSelector('input[type="password"]', { timeout: 15000 });
        await page.fill('input[type="password"]', password);
        await page.click('#idSIButton9');

        // 3. Stay signed in?
        try {
            await page.waitForSelector('#idSIButton9', { timeout: 5000 });
            await page.click('#idSIButton9');
        } catch (e) { }

        // 4. Check for Inbox markers
        await page.waitForTimeout(10000);
        const inLobby = await page.evaluate(() => {
            return !!document.querySelector('#O365_AppName_Title, [aria-label*="Outlook"], .ms-Icon--OutlookLogo');
        });

        return inLobby;
    } catch (e: any) {
        logger.error(`[VERIFIER] Verification failed: ${e.message}`);
        return false;
    } finally {
        if (page) await page.close();
    }
}

// Kick off the factory
if (require.main === module) {
    runFactory(6).catch(err => {
        logger.error('CRITICAL FACTORY FAILURE', err);
        process.exit(1);
    });
}
