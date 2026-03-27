import crypto from 'crypto';
import { Request } from 'express';
import { prisma } from '../prisma';
import { logger } from '../utils/logger';
import { redis } from '../utils/redis';

function nowIso() {
  return new Date().toISOString();
}

export class CanaryTrapService {
  static async tripCanaryApiKey(args: {
    tenantId: string;
    userId: string;
    apiKeyId: string;
    keyName: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    const detail = {
      apiKeyId: args.apiKeyId,
      keyName: args.keyName,
      ipAddress: args.ipAddress || null,
      userAgent: args.userAgent || null,
      trippedAt: nowIso(),
    };

    await prisma.auditLog.create({
      data: {
        tenantId: args.tenantId,
        userId: args.userId,
        action: 'security.canary_key_tripped',
        resource: `api_key:${args.apiKeyId}`,
        detail,
        ip: args.ipAddress || null,
      },
    }).catch(() => undefined);

    logger.warn('Canary API key tripped', detail);
  }

  static async tripHoneyEndpoint(req: Request) {
    const payload = {
      ipAddress: req.ip || req.socket.remoteAddress || null,
      userAgent: String(req.headers['user-agent'] || ''),
      path: req.originalUrl || req.url,
      method: req.method,
      trippedAt: nowIso(),
      trapId: crypto.createHash('sha1').update(`${req.ip || 'unknown'}:${req.originalUrl || req.url}`).digest('hex').slice(0, 12),
    };
    await redis.lpush('camel:security:honey-events', JSON.stringify(payload));
    await redis.ltrim('camel:security:honey-events', 0, 199);
    logger.warn('Honey endpoint tripped', payload);
    return payload;
  }

  static async listHoneyEvents(limit = 50) {
    const raw = await redis.lrange('camel:security:honey-events', 0, Math.max(0, limit - 1));
    return raw
      .map((item) => {
        try {
          return JSON.parse(item);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }
}
