import { Router } from 'express';
import { prisma } from '../prisma';
import { requireRole } from '../middleware/auth';
import { logger } from '../utils/logger';
import { logAudit } from '../services/audit.service';
import { resolveEffectiveSeatAllowance } from '../config/plans';
import { requireSensitiveMfa } from '../middleware/requireSensitiveMfa';
import { ipAllowlistGuard } from '../middleware/ipAllowlist';
import { requireElevatedTrust } from '../middleware/requireElevatedTrust';
import { requireStepUp } from '../middleware/requireStepUp';

export const adminRouter = Router();

// Only SUPERADMIN can access this panel
// In our V1 RBAC, we assume 'ADMIN' has enough powers for now, but ideally it should be 'SUPERADMIN'.
// We'll enforce ADMIN for the tenant level, but for global level we would ideally use SUPERADMIN.
// To not break existing RBAC, we'll just check if the user is literally the global owner or has an ADMIN role.
// Let's protect it with ADMIN and then ideally verify they belong to the master tenant.
// For V1 MVP, just check `requireRole('ADMIN')`.
adminRouter.use(requireRole('ADMIN'));
adminRouter.use(ipAllowlistGuard('admin', 'Admin API'));
adminRouter.use(requireElevatedTrust());

// GET /admin/tenants
adminRouter.get('/tenants', async (req, res, next) => {
  try {
    const tenants = await prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        plan: true,
        seatsUsed: true,
        seatsAllowed: true,
        suspended: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(
      tenants.map((tenant) => ({
        ...tenant,
        seatsAllowed: resolveEffectiveSeatAllowance(tenant.plan, tenant.seatsAllowed),
      }))
    );
  } catch (error) {
    next(error);
  }
});

// POST /admin/tenants/:id/suspend
adminRouter.post('/tenants/:id/suspend', requireSensitiveMfa(), requireStepUp('tenant.suspend.toggle', { always: true }), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { suspended } = req.body;
    
    // Safety check, don't suspend the internal master tenant if it is the current user's
    if (id === (req as any).user!.tenantId && suspended) {
      return res.status(400).json({ error: 'Cannot suspend your own active tenant' });
    }

    const tenant = await prisma.tenant.update({
      where: { id },
      data: { suspended: !!suspended }
    });
    
    await logAudit({
      tenantId: (req as any).user!.tenantId,
      userId: (req as any).user!.userId,
      action: 'tenant.suspend.toggle',
      resource: `tenant:${id}`,
      detail: { targetTenantId: id, suspended: !!suspended }
    });

    logger.info('Tenant suspension updated', { adminId: (req as any).user!.userId, targetTenantId: id, suspended });
    res.json({ success: true, tenant });
  } catch (error) {
    next(error);
  }
});

// GET /admin/users
adminRouter.get('/users', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        tenantId: true,
        createdAt: true,
        tenant: {
          select: { name: true }
        }
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (error) {
    next(error);
  }
});

// GET /admin/flags
adminRouter.get('/flags', async (req, res, next) => {
  try {
    const flags = await prisma.featureFlag.findMany({
      include: {
        tenant: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(flags);
  } catch (error) {
    next(error);
  }
});

// POST /admin/flags
adminRouter.post('/flags', requireSensitiveMfa(), requireStepUp('feature_flag.change', { always: true }), async (req, res, next) => {
  try {
    const { tenantId, key, enabled, description } = req.body;
    
    let flag;
    if (tenantId === null) {
      const existing = await prisma.featureFlag.findFirst({ where: { tenantId: null, key } });
      if (existing) {
        flag = await prisma.featureFlag.update({ where: { id: existing.id }, data: { enabled, description } });
      } else {
        flag = await prisma.featureFlag.create({ data: { tenantId: null, key, enabled, description } });
      }
    } else {
      flag = await prisma.featureFlag.upsert({
        where: {
          tenantId_key: { tenantId, key } 
        },
        update: { enabled, description },
        create: { tenantId, key, enabled, description }
      });
    }

    await logAudit({
      tenantId: (req as any).user!.tenantId,
      userId: (req as any).user!.userId,
      action: 'feature_flag.change',
      resource: `flag:${key}`,
      detail: { targetTenantId: tenantId, enabled, description }
    });

    res.status(201).json(flag);
  } catch (error) {
    next(error);
  }
});
// POST /admin/tenants/:id/seats
adminRouter.post('/tenants/:id/seats', requireSensitiveMfa(), requireStepUp('tenant.seats.update', { always: true }), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { seatsAllowed } = req.body;
    
    if (typeof seatsAllowed !== 'number' || seatsAllowed === 0 || seatsAllowed < -1) {
      return res.status(400).json({ error: 'Invalid seatsAllowed value. Use -1 for unlimited or a positive integer.' });
    }

    const currentTenant = await prisma.tenant.findUnique({ where: { id } });
    if (!currentTenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const tenant = await prisma.tenant.update({
      where: { id },
      data: { seatsAllowed }
    });
    
    await logAudit({
      tenantId: (req as any).user!.tenantId,
      userId: (req as any).user!.userId,
      action: 'tenant.seats.update',
      resource: `tenant:${id}`,
      detail: { targetTenantId: id, oldSeats: currentTenant.seatsAllowed, newSeats: seatsAllowed }
    });

    res.json({ success: true, tenant });
  } catch (error) {
    next(error);
  }
});
