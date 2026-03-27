import { prisma } from '../prisma';
import { config } from '../config';
import { logger } from '../utils/logger';

// Stripe is optional — only active when STRIPE_SECRET_KEY is set
let stripe: any = null;
try {
  if (config.stripe.secretKey) {
    // Dynamic import so the app doesn't crash if stripe isn't installed
    const Stripe = require('stripe');
    stripe = new Stripe(config.stripe.secretKey, { apiVersion: '2023-10-16' });
    logger.info('Stripe initialized');
  } else {
    logger.warn('Stripe not configured — billing features disabled');
  }
} catch {
  logger.warn('Stripe package not installed — billing features disabled');
}

export function isStripeConfigured(): boolean {
  return stripe !== null;
}

/**
 * Create a Stripe Checkout session for plan upgrade
 */
export async function createCheckoutSession(tenantId: string, plan: string) {
  if (!stripe) throw new Error('Stripe not configured');

  const priceId = (config.stripe.prices as any)[plan];
  if (!priceId) throw new Error(`No Stripe price configured for plan: ${plan}`);

  // Get or create Stripe customer
  let subscription = await (prisma as any).subscription.findUnique({ where: { tenantId } });

  let customerId: string;
  if (subscription?.stripeCustomerId) {
    customerId = subscription.stripeCustomerId;
  } else {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const customer = await stripe.customers.create({
      metadata: { tenantId },
      name: tenant?.name || tenantId,
    });
    customerId = customer.id;

    // Create or update subscription record
    if (subscription) {
      await (prisma as any).subscription.update({
        where: { tenantId },
        data: { stripeCustomerId: customerId },
      });
    } else {
      await (prisma as any).subscription.create({
        data: { tenantId, stripeCustomerId: customerId, plan: 'free' },
      });
    }
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/billing/cancel`,
    metadata: { tenantId, plan },
  });

  logger.info('Checkout session created', { tenantId, plan, sessionId: session.id });
  return { url: session.url, sessionId: session.id };
}

/**
 * Create Stripe billing portal session
 */
export async function createBillingPortalSession(tenantId: string) {
  if (!stripe) throw new Error('Stripe not configured');

  const subscription = await (prisma as any).subscription.findUnique({ where: { tenantId } });
  if (!subscription?.stripeCustomerId) {
    throw new Error('No Stripe customer found for this tenant');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/billing`,
  });

  return { url: session.url };
}

/**
 * Handle Stripe webhook events
 */
export async function handleWebhookEvent(rawBody: Buffer, signature: string) {
  if (!stripe) throw new Error('Stripe not configured');

  const event = stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);

  logger.info('Stripe webhook received', { type: event.type });

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const tenantId = session.metadata?.tenantId;
      const plan = session.metadata?.plan;
      if (tenantId && plan) {
        await (prisma as any).subscription.update({
          where: { tenantId },
          data: {
            stripeSubscriptionId: session.subscription,
            plan,
            status: 'active',
          },
        });
        await prisma.tenant.update({
          where: { id: tenantId },
          data: { plan },
        });
        logger.info('Subscription activated', { tenantId, plan });
      }
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const dbSub = await (prisma as any).subscription.findFirst({
        where: { stripeSubscriptionId: sub.id },
      });
      if (dbSub) {
        await (prisma as any).subscription.update({
          where: { id: dbSub.id },
          data: {
            status: sub.status,
            currentPeriodStart: new Date(sub.current_period_start * 1000),
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
          },
        });
        logger.info('Subscription updated', { tenantId: dbSub.tenantId, status: sub.status });
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const dbSub = await (prisma as any).subscription.findFirst({
        where: { stripeSubscriptionId: sub.id },
      });
      if (dbSub) {
        await (prisma as any).subscription.update({
          where: { id: dbSub.id },
          data: { status: 'canceled', plan: 'free' },
        });
        await prisma.tenant.update({
          where: { id: dbSub.tenantId },
          data: { plan: 'free' },
        });
        logger.info('Subscription canceled', { tenantId: dbSub.tenantId });
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const dbSub = await (prisma as any).subscription.findFirst({
        where: { stripeCustomerId: invoice.customer },
      });
      if (dbSub) {
        await (prisma as any).subscription.update({
          where: { id: dbSub.id },
          data: { status: 'past_due' },
        });
        logger.warn('Payment failed', { tenantId: dbSub.tenantId });
      }
      break;
    }

    default:
      logger.debug('Unhandled Stripe event', { type: event.type });
  }

  return { received: true };
}

/**
 * Get subscription status for tenant
 */
export async function getSubscriptionStatus(tenantId: string) {
  const subscription = await (prisma as any).subscription.findUnique({ where: { tenantId } });
  return subscription || { plan: 'free', status: 'active' };
}

/**
 * Validate a license key for offline/enterprise use
 */
export async function validateLicenseKey(licenseKey: string) {
  // In a real scenario, this would check a license server or signed JWT.
  // For CamelFarm, we'll implement a deterministic check for now.
  if (!licenseKey) return false;
  if (licenseKey.startsWith('CAMEL-PRO-') || licenseKey.startsWith('CAMEL-ULTRA-')) {
    return true;
  }
  return false;
}
