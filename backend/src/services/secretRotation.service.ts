import crypto from 'crypto';
import { prisma } from '../prisma';

export class SecretRotationService {
  static async rotateApiKey(tenantId: string, userId: string, apiKeyId: string, graceMinutes = 10) {
    const existing = await (prisma as any).apiKey.findFirst({
      where: { id: apiKeyId, tenantId },
    });
    if (!existing) {
      throw new Error('API key not found');
    }

    const rawKey = `mvp_${crypto.randomBytes(32).toString('hex')}`;
    const hashedKey = crypto.createHash('sha256').update(rawKey).digest('hex');
    const prefix = rawKey.substring(0, 12);

    const replacement = await (prisma as any).apiKey.create({
      data: {
        tenantId,
        userId,
        name: `${existing.name} (rotated)`,
        key: hashedKey,
        prefix,
        scopes: existing.scopes || ['read', 'write'],
        expiresAt: existing.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    await (prisma as any).apiKey.update({
      where: { id: apiKeyId },
      data: {
        expiresAt: new Date(Date.now() + Math.max(1, graceMinutes) * 60 * 1000),
        name: `${existing.name} (retiring)`,
      },
    });

    return {
      replacement: {
        ...replacement,
        key: rawKey,
      },
      retiringKeyId: apiKeyId,
      graceMinutes,
    };
  }

  static async rotateWebhookSecret(tenantId: string, userId: string, webhookId: string) {
    const existing = await (prisma as any).webhook.findFirst({
      where: { id: webhookId, tenantId },
    });
    if (!existing) {
      throw new Error('Webhook not found');
    }

    const secret = crypto.randomBytes(32).toString('hex');

    const updated = await (prisma as any).webhook.update({
      where: { id: webhookId },
      data: {
        secret,
      },
    });

    return {
      webhook: {
        id: updated.id,
        url: updated.url,
        events: updated.events,
        active: updated.active,
      },
      secret,
      rotatedBy: userId,
      rotatedAt: new Date().toISOString(),
    };
  }
}
