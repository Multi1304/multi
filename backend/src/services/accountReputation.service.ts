import { prisma } from '../prisma';
import { logger } from '../utils/logger';
import { XaiService } from './xai.service';
import { BrowserNodeService } from './browser.node';
import { HumanBehaviorPolicyService } from './humanBehaviorPolicy.service';
import { RuntimeEnvironmentService } from './runtimeEnvironment.service';

export class AccountReputationService {
  static async refreshScore(accountId: string, tenantId: string) {
    const account = await (prisma.account as any).findFirst({
      where: { id: accountId, tenantId },
      include: { profile: true },
    });
    if (!account) throw new Error('Account not found');

    const heuristic = this.computeHeuristicScore(account);
    const ai = await this.computeAiSummary(account, heuristic).catch(() => null);
    const nextState = {
      ...((account.state as any) || {}),
      reputation: {
        score: ai?.score ?? heuristic.score,
        grade: ai?.grade ?? heuristic.grade,
        reasons: ai?.reasons ?? heuristic.reasons,
        updatedAt: new Date().toISOString(),
      },
    };

    const updated = await (prisma.account as any).update({
      where: { id: accountId },
      data: { state: nextState as any },
      include: { profile: true },
    });

    return updated;
  }

  static async maybeAutoWarmup(accountId: string, tenantId: string) {
    const account = await (prisma.account as any).findFirst({
      where: { id: accountId, tenantId },
      include: { profile: true },
    });
    if (!account) return null;

    const runtimeMode = await RuntimeEnvironmentService.resolve({
      tenantId,
      fingerprint: account.profile?.fingerprint,
    });
    const warmupUrl = (account.state as any)?.firstPartyWarmupUrl || null;
    if (runtimeMode === 'sandbox' || !warmupUrl || !/^https?:\/\//i.test(warmupUrl)) {
      return null;
    }

    const host = new URL(warmupUrl).hostname.toLowerCase();
    const allowedHosts = ((account.state as any)?.allowedWarmupHosts || ['localhost', '127.0.0.1']).map((item: any) => String(item).toLowerCase());
    const allowed = allowedHosts.some((entry: string) => host === entry || host.endsWith(`.${entry}`));
    if (!allowed) {
      logger.warn('Skipped account auto warmup outside first-party allowlist', { accountId, tenantId, host });
      return null;
    }

    const page = await BrowserNodeService.createPage(account.profileId, account.profile?.fingerprint, account.profile?.proxyConfig);
    try {
      await page.goto(warmupUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(await HumanBehaviorPolicyService.nextSettleDelay());
      await page.mouse.move(120, 140, { steps: await HumanBehaviorPolicyService.nextMouseSteps() });
      await page.mouse.wheel(0, 240);
      await page.waitForTimeout(await HumanBehaviorPolicyService.nextSettleDelay());
      await (prisma.account as any).update({
        where: { id: accountId },
        data: {
          state: {
            ...((account.state as any) || {}),
            lastWarmupAt: new Date().toISOString(),
            lastWarmupUrl: warmupUrl,
          } as any,
        },
      });
      return { warmed: true, url: warmupUrl };
    } catch (error: any) {
      logger.warn('Account auto warmup failed', { accountId, tenantId, error: error?.message });
      return { warmed: false, error: error?.message || 'warmup_failed' };
    } finally {
      await page.close().catch(() => null);
    }
  }

  private static computeHeuristicScore(account: any) {
    let score = 50;
    const reasons: string[] = [];

    if (account.verified) {
      score += 25;
      reasons.push('Account is verified.');
    }
    if (account.inboxStatus === 'verified') {
      score += 15;
      reasons.push('Inbox verification succeeded.');
    } else if (account.inboxStatus === 'failed') {
      score -= 20;
      reasons.push('Inbox verification failed recently.');
    }
    if (account.used === false) {
      score += 5;
      reasons.push('Account has not been consumed yet.');
    }
    if (account.lastVictoryAt) {
      score += 5;
      reasons.push('Flow victory markers were recorded.');
    }

    score = Math.max(0, Math.min(100, score));
    return {
      score,
      grade: score >= 85 ? 'strong' : score >= 65 ? 'review' : 'weak',
      reasons,
    };
  }

  private static async computeAiSummary(account: any, heuristic: { score: number; grade: string; reasons: string[] }) {
    const prompt = JSON.stringify({
      username: account.username,
      verified: account.verified,
      inboxStatus: account.inboxStatus,
      used: account.used,
      lastVictoryAt: account.lastVictoryAt,
      heuristic,
    });
    const response = await XaiService.chat(
      `Evaluate the health of this first-party account and respond as JSON with keys score, grade, reasons. Data: ${prompt}`,
      'You are an account health analyst for first-party automation sandboxes. Stay within safe operational scoring.'
    );
    return JSON.parse(response);
  }
}
