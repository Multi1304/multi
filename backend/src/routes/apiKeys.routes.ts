import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';
import crypto from 'crypto';
import { z } from 'zod';
import { requireStepUp } from '../middleware/requireStepUp';
import { SecretRotationService } from '../services/secretRotation.service';
import { DestructiveActionService } from '../services/destructiveAction.service';
import { logAudit } from '../services/audit.service';
import { requireSecurityCapability } from '../middleware/requireSecurityCapability';

const router = Router();
router.use(authMiddleware);

const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).optional(),
  expiresInDays: z.number().min(1).max(365).optional(),
});
const RotateApiKeySchema = z.object({
  graceMinutes: z.number().int().min(1).max(1440).optional(),
});

/**
 * @openapi
 * /api/keys:
 *   get:
 *     summary: List API keys
 *     description: Returns all API keys for the current tenant.
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of keys.
 *   post:
 *     summary: Create API key
 *     description: Generates a new API key. The raw key is only returned once.
 *     tags: [API Keys]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               expiresInDays: { type: number }
 *     responses:
 *       201:
 *         description: Key created.
 */

/**
 * GET /api/keys — List API keys for the current tenant
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const keys = await (prisma as any).apiKey.findMany({
      where: { tenantId: req.user!.tenantId },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        lastUsed: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(keys);
  } catch (err: any) {
    logger.error('API Key list error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/keys — Create a new API key
 */
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, scopes, expiresInDays } = CreateApiKeySchema.parse(req.body);

    // Generate a random key
    const rawKey = `mvp_${crypto.randomBytes(32).toString('hex')}`;
    const hashedKey = crypto.createHash('sha256').update(rawKey).digest('hex');
    const prefix = rawKey.substring(0, 12); // mvp_ + 8 chars

    const effectiveExpiresInDays = expiresInDays ?? 30;
    const expiresAt = new Date(Date.now() + effectiveExpiresInDays * 24 * 60 * 60 * 1000);

    const apiKey = await (prisma as any).apiKey.create({
      data: {
        tenantId: req.user!.tenantId,
        userId: req.user!.userId,
        name,
        key: hashedKey,
        prefix,
        scopes: scopes || ['read', 'write'],
        expiresAt,
      },
    });

    logger.info('API Key created', { keyId: apiKey.id, userId: req.user!.userId });

    // Return the RAW key only once
    return res.status(201).json({
      ...apiKey,
      key: rawKey, // CLIENT MUST SAVE THIS
      expiresInDays: effectiveExpiresInDays,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: err.issues });
    }
    logger.error('API Key creation error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/canary', requireSecurityCapability('rotateSecrets'), requireStepUp('api_key.canary.create', { always: true }), async (req: AuthRequest, res: Response) => {
  try {
    const rawKey = `mvp_${crypto.randomBytes(32).toString('hex')}`;
    const hashedKey = crypto.createHash('sha256').update(rawKey).digest('hex');
    const prefix = rawKey.substring(0, 12);

    const apiKey = await (prisma as any).apiKey.create({
      data: {
        tenantId: req.user!.tenantId,
        userId: req.user!.userId,
        name: req.body?.name || 'Canary Trap Key',
        key: hashedKey,
        prefix,
        scopes: ['canary:trip'],
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });

    await logAudit({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: 'api_key.canary_created',
      resource: `api_key:${apiKey.id}`,
      detail: { name: apiKey.name },
    });

    return res.status(201).json({
      ...apiKey,
      key: rawKey,
      mode: 'canary',
    });
  } catch (err: any) {
    logger.error('Canary API key creation error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/rotate', requireSecurityCapability('rotateSecrets'), requireStepUp('api_key.rotate', { always: true }), async (req: AuthRequest, res: Response) => {
  try {
    const { graceMinutes } = RotateApiKeySchema.parse(req.body || {});
    const result = await SecretRotationService.rotateApiKey(
      req.user!.tenantId,
      req.user!.userId,
      req.params.id,
      graceMinutes
    );

    await logAudit({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: 'api_key.rotated',
      resource: `api_key:${req.params.id}`,
      detail: {
        retiringKeyId: result.retiringKeyId,
        replacementKeyId: result.replacement.id,
        graceMinutes: result.graceMinutes,
      },
    });

    return res.json(result);
  } catch (err: any) {
    logger.error('API Key rotation error', { error: err.message });
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * DELETE /api/keys/:id — Revoke an API key
 */
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const key = await (prisma as any).apiKey.findUnique({ where: { id } });
    if (!key || key.tenantId !== req.user!.tenantId) {
      return res.status(404).json({ error: 'API Key not found' });
    }

    if (DestructiveActionService.isEnabled()) {
      const task = await DestructiveActionService.schedule({
        tenantId: req.user!.tenantId,
        userId: req.user!.userId,
        action: 'api_key.delete',
        resource: `api_key:${id}`,
        payload: { apiKeyId: id },
        note: 'API key revocation scheduled with undo window',
      });
      logger.info('API Key revocation scheduled', { keyId: id, userId: req.user!.userId, taskId: task.id });
      return res.status(202).json({ queued: true, task });
    }

    await (prisma as any).apiKey.delete({ where: { id } });
    logger.info('API Key revoked', { keyId: id, userId: req.user!.userId });
    return res.json({ message: 'API Key revoked' });
  } catch (err: any) {
    logger.error('API Key revocation error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
