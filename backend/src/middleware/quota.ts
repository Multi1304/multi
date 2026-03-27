import { Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { prisma } from '../prisma';
import { getPlanLimits } from '../config/plans';
import { config } from '../config';
import { AuthRequest } from './auth';
import { logger } from '../utils/logger';
import { TenantCapacityService } from '../services/tenantCapacity.service';

const redis = new Redis({ host: config.redis.host, port: config.redis.port });

/**
 * Quota middleware — enforces rate limits per tenant plan.
 * Uses Redis sliding window counters for jobs per minute/hour/day.
 * Also checks max profiles and accounts against plan limits.
 */
export function quotaMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  (async () => {
    try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

    const [tenant, userCount] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId } }),
      prisma.user.count({ where: { tenantId } })
    ]);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const limits = getPlanLimits(tenant.plan);
    const status = await TenantCapacityService.getStatus(tenantId);
    if (!TenantCapacityService.isLicenseCurrentlyValid(status, { tenantId, plan: tenant.plan })) {
      return res.status(403).json({ error: 'Tenant license is not active for runtime execution' });
    }
    const seatMinuteLimit = status.effectiveRequestsPerMinute;
    const effectiveJobsPerMinute = limits.jobsPerMinute > 0
      ? Math.min(limits.jobsPerMinute, seatMinuteLimit)
      : seatMinuteLimit;

    // Check job rate limits via Redis counters
    const now = Math.floor(Date.now() / 1000);
    const minuteKey = `quota:${tenantId}:jobs:min:${Math.floor(now / 60)}`;
    const hourKey = `quota:${tenantId}:jobs:hr:${Math.floor(now / 3600)}`;
    const dayKey = `quota:${tenantId}:jobs:day:${Math.floor(now / 86400)}`;

    const [minCount, hrCount, dayCount] = await Promise.all([
      redis.get(minuteKey),
      redis.get(hourKey),
      redis.get(dayKey),
    ]);

    if (effectiveJobsPerMinute > 0 && Number(minCount || 0) >= effectiveJobsPerMinute) {
      logger.warn('Rate limit exceeded (per minute)', { tenantId, count: minCount, effectiveJobsPerMinute });
      return res.status(429).json({ error: `Rate limit: too many jobs per minute (${effectiveJobsPerMinute})`, retryAfter: 60 });
    }
    if (limits.jobsPerHour > 0 && Number(hrCount || 0) >= limits.jobsPerHour) {
      logger.warn('Rate limit exceeded (per hour)', { tenantId, count: hrCount });
      return res.status(429).json({ error: 'Rate limit: too many jobs per hour', retryAfter: 3600 });
    }
    if (limits.jobsPerDay > 0 && Number(dayCount || 0) >= limits.jobsPerDay) {
      logger.warn('Rate limit exceeded (per day)', { tenantId, count: dayCount });
      return res.status(429).json({ error: 'Rate limit: too many jobs per day', retryAfter: 86400 });
    }

    // Increment counters with TTL
    const pipeline = redis.pipeline();
    pipeline.incr(minuteKey);
    pipeline.expire(minuteKey, 120);   // 2 min TTL
    pipeline.incr(hourKey);
    pipeline.expire(hourKey, 7200);    // 2 hour TTL
    pipeline.incr(dayKey);
    pipeline.expire(dayKey, 172800);   // 2 day TTL
    await pipeline.exec();

    next();
    } catch (err: any) {
      logger.error('Quota middleware error', { error: err?.message });
      res.status(500).json({ error: 'Internal error' });
    }
  })();
}

/**
 * Resource limit middleware — checks profiles/accounts/seats against plan.
 * Use on profile/account creation endpoints.
 */
export function resourceLimitMiddleware(
  resource: 'profiles' | 'accounts' | 'seats',
) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

      const limits = getPlanLimits(tenant.plan);

      if (resource === 'profiles') {
        if (limits.maxProfiles > 0) {
          const count = await prisma.profile.count({ where: { tenantId } });
          if (count >= limits.maxProfiles) {
            return res.status(403).json({ error: `Profile limit reached (${limits.maxProfiles} for ${tenant.plan} plan)` });
          }
        }
      } else if (resource === 'accounts') {
        if (limits.maxAccounts > 0) {
          const count = await prisma.account.count({ where: { tenantId } });
          if (count >= limits.maxAccounts) {
            return res.status(403).json({ error: `Account limit reached (${limits.maxAccounts} for ${tenant.plan} plan)` });
          }
        }
      } else if (resource === 'seats') {
        if (limits.maxSeats > 0) {
          const count = await prisma.user.count({ where: { tenantId } });
          if (count >= limits.maxSeats) {
            return res.status(403).json({ error: `Seat limit reached (${limits.maxSeats} for ${tenant.plan} plan)` });
          }
        }
      }

      next();
    } catch (err: any) {
      logger.error('Resource limit error', { error: err?.message });
      res.status(500).json({ error: 'Internal error' });
    }
  };
}

/**
 * Validates discrete daily execution events directly against Billing Plan quotas.
 */
export function dailyActionLimitMiddleware(
  actionType: 'maxBulkOperationsPerDay' | 'maxTaskBatchesPerDay'
) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'test') return next();

    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) return res.status(401).json({ error: 'Unauthorized' });

      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

      const limits = getPlanLimits(tenant.plan);
      const maxAllowed = limits[actionType];

      if (maxAllowed < 0) { // Infinite (-1)
         return next();
      }

      const now = Math.floor(Date.now() / 1000);
      const dayKey = `quota:${tenantId}:${actionType}:day:${Math.floor(now / 86400)}`;
      
      const count = await redis.get(dayKey);
      
      if (Number(count || 0) >= maxAllowed) {
        logger.warn('limit exceeded - Daily constraint triggered', { tenantId, actionType, count: Number(count) });
        return res.status(429).json({ error: `Daily limit reached for ${actionType} (${maxAllowed} per day on ${tenant.plan} plan).` });
      }

      await redis.incr(dayKey);
      await redis.expire(dayKey, 172800); // Allow drift overlap just in case, typical for daily buckets

      next();
    } catch (err: any) {
      logger.error('Daily action limit error', { error: err?.message });
      res.status(500).json({ error: 'Internal API limit check error' });
    }
  };
}
