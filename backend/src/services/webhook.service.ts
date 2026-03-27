import axios from 'axios';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { logger } from '../utils/logger';

export class WebhookService {
  /**
   * Trigger a webhook event for a tenant.
   */
  static async trigger(tenantId: string, event: string, payload: any) {
    const webhooks = await (prisma as any).webhook.findMany({
      where: {
        tenantId,
        active: true,
        events: { has: event }
      }
    });

    if (webhooks.length === 0) return;

    logger.info('Triggering webhooks', { tenantId, event, count: webhooks.length });

    const promises = webhooks.map(async (webhook: any) => {
      try {
        const timestamp = Date.now();
        const body = JSON.stringify({
          event,
          timestamp,
          payload
        });

        // Generate signature (HMAC-SHA256)
        const signature = crypto
          .createHmac('sha256', webhook.secret)
          .update(body)
          .digest('hex');

        await axios.post(webhook.url, body, {
          headers: {
            'Content-Type': 'application/json',
            'X-Multilogin-Event': event,
            'X-Multilogin-Signature': signature,
            'X-Multilogin-Timestamp': timestamp.toString()
          },
          timeout: 5000
        });

        logger.debug('Webhook sent successfully', { webhookId: webhook.id, url: webhook.url });
      } catch (error: any) {
        logger.error('Webhook failed', {
          webhookId: webhook.id,
          url: webhook.url,
          error: error.message,
          response: error.response?.data
        });
      }
    });

    // We don't necessarily want to wait for all webhooks to finish in the request cycle,
    // but for now we'll use Promise.allSettled to ensure they are at least attempted.
    // In a high-scale V2, this would be handled by a background queue (BullMQ).
    await Promise.allSettled(promises);
  }
}
