import { redis } from '../utils/redis';
import { prisma } from '../prisma';
import { logger } from '../utils/logger';
import { ScaleMetricsService } from './scaleMetrics.service';

interface ProfilesPageOptions {
  tenantId: string;
  role: string;
  userId: string;
  page?: number;
  pageSize?: number;
  search?: string;
}

export class ProfileCacheService {
  private static readonly PROFILE_TTL = 3600; // 1 hour
  private static readonly PROFILE_LIST_TTL = 60; // 1 minute

  static async getProfile(id: string) {
    const key = `v3:profile:${id}`;
    
    try {
      const cached = await redis.get(key);
      if (cached) {
        await ScaleMetricsService.recordCacheOutcome('profile:detail', true);
        return JSON.parse(cached);
      }
      await ScaleMetricsService.recordCacheOutcome('profile:detail', false);

      const profile = await (prisma.profile as any).findUnique({
        where: { id },
        include: { accounts: { select: { id: true, username: true } } }
      });

      if (profile) {
        await redis.set(key, JSON.stringify(profile), 'EX', this.PROFILE_TTL);
      }
      return profile;

    } catch (err) {
      logger.error('Profile cache failure, falling back to DB', { error: err });
      await ScaleMetricsService.recordCacheOutcome('profile:detail', false);
      return await (prisma.profile as any).findUnique({ where: { id } });
    }
  }

  static async invalidateProfile(id: string) {
    try {
      await redis.del(`v3:profile:${id}`);
    } catch(err) {
       logger.error('Error invalidating profile cache', { id, error: err });
    }
  }

  static async invalidateProfileLists(tenantId: string) {
    try {
      const keys = await redis.keys(`v3:profiles:list:${tenantId}:*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (err) {
      logger.error('Error invalidating profile list caches', { tenantId, error: err });
    }
  }

  /**
   * Specifically fetches high-level counts / summaries to support 10,000+ views
   */
  static async getProfilesListCached(tenantId: string, role: string, userId: string) {
      const result = await this.getProfilesPageCached({ tenantId, role, userId, page: 1, pageSize: 500 });
      return result.items;
  }

  static async getProfilesPageCached(options: ProfilesPageOptions) {
      const {
        tenantId,
        role,
        userId,
        page = 1,
        pageSize = 50,
        search = ''
      } = options;

      const normalizedPage = Math.max(1, Number(page) || 1);
      const normalizedPageSize = Math.min(200, Math.max(1, Number(pageSize) || 50));
      const normalizedSearch = (search || '').trim().toLowerCase();
      const cacheKey = `v3:profiles:list:${tenantId}:${role}:${userId}:page:${normalizedPage}:size:${normalizedPageSize}:search:${normalizedSearch || '_'}`;

      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          await ScaleMetricsService.recordCacheOutcome('profile:list', true);
          return JSON.parse(cached);
        }
      } catch (err) {
        logger.warn('Profile list cache read failed', { tenantId, userId, error: err });
      }

      await ScaleMetricsService.recordCacheOutcome('profile:list', false);
      const startedAt = Date.now();
      const whereClause: any = role === 'ADMIN' ? { tenantId } : { tenantId, userId };
      if (normalizedSearch) {
        whereClause.OR = [
          { name: { contains: normalizedSearch, mode: 'insensitive' } },
          { platform: { contains: normalizedSearch, mode: 'insensitive' } },
          { locale: { contains: normalizedSearch, mode: 'insensitive' } }
        ];
      }

      const [items, total] = await Promise.all([
        (prisma.profile as any).findMany({
          where: whereClause,
          orderBy: { createdAt: 'desc' },
          skip: (normalizedPage - 1) * normalizedPageSize,
          take: normalizedPageSize
        }),
        (prisma.profile as any).count({ where: whereClause })
      ]);

      await ScaleMetricsService.observeDuration('profiles:list_query', Date.now() - startedAt);

      const payload = {
        items,
        page: normalizedPage,
        pageSize: normalizedPageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / normalizedPageSize))
      };

      try {
        await redis.set(cacheKey, JSON.stringify(payload), 'EX', this.PROFILE_LIST_TTL);
      } catch (err) {
        logger.warn('Profile list cache write failed', { tenantId, userId, error: err });
      }

      return payload;
  }
}
