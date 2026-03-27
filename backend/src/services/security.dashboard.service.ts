import { prisma } from '../prisma';
import { logger } from '../utils/logger';
import { TotpService } from './totp.service';
import { config } from '../config';
import { SecurityPostureService } from './securityPosture.service';

export class SecurityDashboardService {
  /**
   * Get an aggregated security overview for a tenant.
   */
  static async getOverview(tenantId: string) {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 1. Audit Log Stats (Critical actions)
    const criticalActions = await (prisma as any).auditLog.count({
      where: {
        tenantId,
        createdAt: { gte: last24h },
        action: { in: ['profile.delete', 'flow.delete', 'user.suspended'] }
      }
    });

    // 2. Flow Run Failures due to Evasion
    const evasionFailures = await (prisma as any).flowRun.count({
      where: {
        tenantId,
        createdAt: { gte: last24h },
        status: 'failed',
        error: { contains: 'evasion' }
      }
    });

    // 3. Risk Signals from Webhooks (Simulated aggregation)
    // In a real V2.6, we'd have a SecuritySignal model. 
    // For now we derive it from logs/runs.
    const riskScore = Math.min(100, (criticalActions * 10) + (evasionFailures * 25));

    const [mfaUsers, totalUsers, securityPosture] = await Promise.all([
      prisma.user.count({ where: { tenantId, mfaEnabled: true } }),
      prisma.user.count({ where: { tenantId } }),
      SecurityPostureService.getSnapshot(tenantId),
    ]);

    return {
      tenantId,
      timeframe: '24h',
      riskScore,
      stats: {
        criticalActions,
        evasionFailures,
        activeWebhooks: await (prisma as any).webhook.count({ where: { tenantId, active: true } }),
        totalAcls: await (prisma as any).accessControl.count({ where: { tenantId } }),
        mfaCoverage: totalUsers > 0 ? Math.round((mfaUsers / totalUsers) * 100) : 0,
      },
      status: riskScore > 70 ? 'CRITICAL' : riskScore > 30 ? 'WARNING' : 'STABLE',
      posture: {
        requireSensitiveMfa: config.security.requireSensitiveMfa,
        adminIpAllowlistConfigured: config.security.adminIpAllowlist.length > 0,
        sensitiveIpAllowlistConfigured: config.security.sensitiveIpAllowlist.length > 0,
      },
      securityPosture,
      apiKeyHygiene: securityPosture.apiKeys,
    };
  }

  static async verifyMfa(userId: string, code: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { mfaEnabled: true, mfaSecret: true },
    });

    if (!user?.mfaEnabled || !user.mfaSecret) {
      logger.warn('MFA verification attempted without enabled MFA', { userId });
      return false;
    }

    const verified = TotpService.verify(user.mfaSecret, code);
    if (verified) {
      logger.info('MFA verified successfully', { userId });
    } else {
      logger.warn('MFA verification failed', { userId });
    }
    return verified;
  }
}
