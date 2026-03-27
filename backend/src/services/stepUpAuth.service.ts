import { prisma } from '../prisma';
import { redis } from '../utils/redis';
import { config } from '../config';
import { SessionRiskService } from './sessionRisk.service';
import { TotpService } from './totp.service';

type StepUpDecision = {
  required: boolean;
  satisfied: boolean;
  reason: 'policy' | 'risk' | 'none';
  ttlMinutes: number;
  risk: {
    score: number;
    level: string;
    reasons: string[];
  } | null;
};

function getCacheKey(tenantId: string, userId: string, actionKey: string) {
  return `camel:stepup:${tenantId}:${userId}:${actionKey}`;
}

export class StepUpAuthService {
  static async isSatisfied(tenantId: string, userId: string, actionKey: string) {
    const result = await redis.get(getCacheKey(tenantId, userId, actionKey));
    return result === '1';
  }

  static async grant(tenantId: string, userId: string, actionKey: string, ttlMinutes = config.security.stepUpTtlMinutes) {
    await redis.set(getCacheKey(tenantId, userId, actionKey), '1', 'EX', Math.max(60, ttlMinutes * 60));
  }

  static async revoke(tenantId: string, userId: string, actionKey: string) {
    await redis.del(getCacheKey(tenantId, userId, actionKey));
  }

  static async evaluate(args: {
    tenantId: string;
    userId: string;
    role: string;
    actionKey: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    always?: boolean;
    riskThreshold?: number;
  }): Promise<StepUpDecision> {
    const ttlMinutes = config.security.stepUpTtlMinutes;
    if (await this.isSatisfied(args.tenantId, args.userId, args.actionKey)) {
      return {
        required: true,
        satisfied: true,
        reason: 'policy',
        ttlMinutes,
        risk: null,
      };
    }

    const risk = await SessionRiskService.evaluate(
      args.userId,
      args.ipAddress,
      args.userAgent || '',
      args.role
    );

    const requiredByRisk = risk.score >= (args.riskThreshold ?? 70);
    const required = Boolean(args.always || requiredByRisk);
    return {
      required,
      satisfied: false,
      reason: args.always ? 'policy' : requiredByRisk ? 'risk' : 'none',
      ttlMinutes,
      risk,
    };
  }

  static async verifyAndGrant(args: {
    tenantId: string;
    userId: string;
    actionKey: string;
    code: string;
  }) {
    const user = await prisma.user.findUnique({
      where: { id: args.userId },
      select: { mfaEnabled: true, mfaSecret: true },
    });

    if (!user?.mfaEnabled || !user.mfaSecret) {
      return { ok: false, error: 'MFA setup required' };
    }

    if (!TotpService.verify(user.mfaSecret, args.code)) {
      return { ok: false, error: 'Invalid MFA code' };
    }

    await this.grant(args.tenantId, args.userId, args.actionKey);
    return { ok: true };
  }
}
