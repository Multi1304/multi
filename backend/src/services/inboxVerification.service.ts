import { prisma } from '../prisma';
import { ScaleMetricsService } from './scaleMetrics.service';
import { AccountStateService } from './accountState.service';

export class InboxVerificationService {
  static async recordSandboxVerification(params: {
    tenantId: string;
    accountId: string;
    success: boolean;
    mode?: string;
    note?: string;
    inboxStatusOverride?: 'verified' | 'pending_check' | 'failed';
  }) {
    const mode = params.mode || 'sandbox';
    await ScaleMetricsService.incrementCounter(`inbox_verification:${mode}:${params.success ? 'success' : 'failure'}`);

    return AccountStateService.updateAccountState(params.accountId, params.tenantId, {
      verified: params.inboxStatusOverride === 'pending_check' ? false : params.success,
      inboxStatus: params.inboxStatusOverride || (params.success ? 'verified' : 'failed'),
      lastInboxCheck: new Date().toISOString(),
      state: {
        inboxVerificationMode: mode,
        inboxVerificationNote: params.note || null,
        inboxVerificationAt: new Date().toISOString(),
      }
    });
  }

  static async summarizeForTenant(tenantId: string) {
    const [verified, pending, failed, unknown] = await Promise.all([
      (prisma.account as any).count({ where: { tenantId, inboxStatus: 'verified' } }),
      (prisma.account as any).count({ where: { tenantId, inboxStatus: 'pending_check' } }),
      (prisma.account as any).count({ where: { tenantId, inboxStatus: 'failed' } }),
      (prisma.account as any).count({ where: { tenantId, inboxStatus: 'unknown' } }),
    ]);

    return {
      verified,
      pending,
      failed,
      unknown,
      total: verified + pending + failed + unknown,
    };
  }
}
