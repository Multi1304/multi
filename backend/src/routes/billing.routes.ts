import { Router, Request, Response } from 'express';
import { authMiddleware, AuthRequest, requireRole } from '../middleware/auth';
import { prisma } from '../prisma';
import { logger } from '../utils/logger';
import {
  isStripeConfigured,
  createCheckoutSession,
  createBillingPortalSession,
  handleWebhookEvent,
  getSubscriptionStatus,
} from '../services/stripe.service';
import { getPlanLimits, resolveEffectiveSeatAllowance, isUnlimitedLimit } from '../config/plans';
import Redis from 'ioredis';
import { config } from '../config';

const router = Router();
const redis = new Redis({ host: config.redis.host, port: config.redis.port });

// Webhook endpoint — MUST use raw body (no JSON parsing)
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }
    const sig = req.headers['stripe-signature'] as string;
    if (!sig) return res.status(400).json({ error: 'Missing stripe-signature header' });

    // Express raw body middleware should be mounted before this route for /billing/webhook
    const rawBody = (req as any).rawBody;
    if (!rawBody) return res.status(400).json({ error: 'Raw body not available' });

    const result = await handleWebhookEvent(rawBody, sig);
    return res.json(result);
  } catch (err: any) {
    logger.error('Webhook error', { error: err?.message });
    return res.status(400).json({ error: err?.message });
  }
});

// Protected endpoints
router.use(authMiddleware);

// GET /billing — Get tenant billing info
router.get('/', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const subscription = await getSubscriptionStatus(tenantId);
    const limits = getPlanLimits(tenant?.plan || 'free');

    return res.json({
      tenant: {
        id: tenant?.id,
        name: tenant?.name,
        plan: tenant?.plan,
        seatsAllowed: resolveEffectiveSeatAllowance(tenant?.plan || 'free', tenant?.seatsAllowed),
        isUnlimitedSeats: isUnlimitedLimit(resolveEffectiveSeatAllowance(tenant?.plan || 'free', tenant?.seatsAllowed)),
      },
      subscription,
      limits,
    });
  } catch (err: any) {
    logger.error('Billing info error', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /billing/checkout — Create Stripe checkout session
router.post('/checkout', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }
    const { plan } = req.body;
    if (!plan || !['pro', 'enterprise', 'ultra'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan. Must be: pro, enterprise, or ultra' });
    }

    const result = await createCheckoutSession(req.user!.tenantId, plan);
    return res.json(result);
  } catch (err: any) {
    logger.error('Checkout error', { error: err?.message });
    res.status(500).json({ error: err?.message });
  }
});

// POST /billing/portal — Create Stripe billing portal session
router.post('/portal', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }
    const result = await createBillingPortalSession(req.user!.tenantId);
    return res.json(result);
  } catch (err: any) {
    logger.error('Portal error', { error: err?.message });
    res.status(500).json({ error: err?.message });
  }
});

// GET /billing/usage — Current quota usage
router.get('/usage', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const limits = getPlanLimits(tenant?.plan || 'free');

    const now = Math.floor(Date.now() / 1000);
    const minuteKey = `quota:${tenantId}:jobs:min:${Math.floor(now / 60)}`;
    const hourKey = `quota:${tenantId}:jobs:hr:${Math.floor(now / 3600)}`;
    const dayKey = `quota:${tenantId}:jobs:day:${Math.floor(now / 86400)}`;

    const [minCount, hrCount, dayCount, profilesCount, accountsCount, usersCount] = await Promise.all([
      redis.get(minuteKey),
      redis.get(hourKey),
      redis.get(dayKey),
      prisma.profile.count({ where: { tenantId } }),
      prisma.account.count({ where: { tenantId } }),
      prisma.user.count({ where: { tenantId } }),
    ]);

    return res.json({
      plan: tenant?.plan || 'free',
      usage: {
        jobsThisMinute: Number(minCount || 0),
        jobsThisHour: Number(hrCount || 0),
        jobsToday: Number(dayCount || 0),
        profiles: profilesCount,
        accounts: accountsCount,
        seats: usersCount,
      },
      limits,
    });
  } catch (err: any) {
    logger.error('Usage error', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /billing/plan — Manual plan change (admin only, for testing/dev)
router.post('/plan', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { plan, seatsAllowed } = req.body;

    const updated = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(plan && { plan }),
        ...(typeof seatsAllowed === 'number' && { seatsAllowed }),
      },
    });

    return res.json(updated);
  } catch (err: any) {
    logger.error('Plan update error', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
