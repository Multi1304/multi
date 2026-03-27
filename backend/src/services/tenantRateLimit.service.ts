import { Redis } from 'ioredis';
import { config } from '../config';
import { PLANS, getPlanLimits } from '../config/plans';
import { logger } from '../utils/logger';

const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
});

export class TenantRateLimitService {
  /**
   * Check if a tenant has exceeded their allowed jobs for the hour/day.
   * Throws if limit exceeded.
   */
  static async checkLimit(tenantId: string, currentPlan: string) {
    const limits = getPlanLimits(currentPlan);
    
    const hourKey = `ratelimit:${tenantId}:hour:${new Date().getHours()}`;
    const dayKey = `ratelimit:${tenantId}:day:${new Date().toISOString().split('T')[0]}`;

    const [hourCount, dayCount] = await Promise.all([
      redis.incr(hourKey),
      redis.incr(dayKey),
    ]);

    // Set TTL if first hit
    if (hourCount === 1) await redis.expire(hourKey, 3600);
    if (dayCount === 1) await redis.expire(dayKey, 86400);

    if (limits.jobsPerHour !== -1 && hourCount > limits.jobsPerHour) {
      logger.warn('Rate limit exceeded (hour)', { tenantId, plan: currentPlan, hourCount });
      throw new Error(`Rate limit exceeded: ${limits.jobsPerHour} profiles per hour allowed on ${currentPlan} plan.`);
    }

    if (limits.jobsPerDay !== -1 && dayCount > limits.jobsPerDay) {
      logger.warn('Rate limit exceeded (day)', { tenantId, plan: currentPlan, dayCount });
      throw new Error(`Rate limit exceeded: ${limits.jobsPerDay} profiles per day allowed on ${currentPlan} plan.`);
    }
  }

  static async getUsage(tenantId: string) {
    const hourKey = `ratelimit:${tenantId}:hour:${new Date().getHours()}`;
    const dayKey = `ratelimit:${tenantId}:day:${new Date().toISOString().split('T')[0]}`;

    const [hourCount, dayCount] = await Promise.all([
      redis.get(hourKey),
      redis.get(dayKey),
    ]);

    return {
      hour: Number(hourCount || 0),
      day: Number(dayCount || 0),
    };
  }
}
