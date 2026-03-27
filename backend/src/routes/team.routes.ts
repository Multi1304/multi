import { Router } from 'express';
import { prisma } from '../prisma';
import { authMiddleware, AuthRequest, requireRole } from '../middleware/auth';
import { logAudit } from '../services/audit.service';
import { logger } from '../utils/logger';
import { validate } from '../middleware/validate';
import { inviteSchema, changeRoleSchema } from '../schemas';
import crypto from 'crypto';
import { AccessService } from '../services/access.service';
import { resolveEffectiveSeatAllowance, isUnlimitedLimit } from '../config/plans';
import { requireSensitiveMfa } from '../middleware/requireSensitiveMfa';

const router = Router();
router.use(authMiddleware);

// GET /team — List users in the current tenant
router.get('/', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const users = await (prisma.user as any).findMany({
      where: { tenantId },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    return res.json(users);
  } catch (err: any) {
    logger.error('Error listing team', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /team/invitations — List pending invitations in the tenant
router.get('/invitations', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const invitations = await (prisma.invitation as any).findMany({
      where: { tenantId, status: 'pending' },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        expiresAt: true,
        invitedBy: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(invitations);
  } catch (err: any) {
    logger.error('Error listing invitations', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/summary', requireRole('ADMIN', 'MANAGER', 'AUDITOR'), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const [tenant, aclSummary, pendingInvites, recentAudit, users] = await Promise.all([
      (prisma.tenant as any).findUnique({
        where: { id: tenantId },
        select: { seatsAllowed: true, seatsUsed: true, plan: true }
      }),
      AccessService.getTenantAclSummary(tenantId),
      (prisma.invitation as any).count({ where: { tenantId, status: 'pending' } }),
      prisma.auditLog.findMany({
        where: {
          tenantId,
          action: { startsWith: 'team.' }
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { user: { select: { email: true, role: true } } }
      }),
      (prisma.user as any).findMany({
        where: { tenantId },
        select: { role: true }
      })
    ]);

    const roleCounts = users.reduce((acc: Record<string, number>, item: any) => {
      acc[item.role] = (acc[item.role] || 0) + 1;
      return acc;
    }, {});

    const effectiveSeatsAllowed = resolveEffectiveSeatAllowance(
      tenant?.plan || 'free',
      tenant?.seatsAllowed
    );

    return res.json({
      tenant: tenant
        ? {
            ...tenant,
            seatsUsed: users.length,
            seatsAllowed: effectiveSeatsAllowed,
            seatLimitSource: isUnlimitedLimit(effectiveSeatsAllowed) ? 'plan' : 'tenant',
            isUnlimitedSeats: isUnlimitedLimit(effectiveSeatsAllowed),
          }
        : { seatsAllowed: 0, seatsUsed: 0, plan: 'UNKNOWN', isUnlimitedSeats: false },
      aclCount: aclSummary.totalGrants,
      aclSummary,
      pendingInvites,
      roleCounts,
      recentAudit
    });
  } catch (err: any) {
    logger.error('Error loading team summary', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /team/invite — Create an invitation
router.post('/invite', requireRole('ADMIN'), requireSensitiveMfa(), validate(inviteSchema), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { email, role } = req.body;

    // --- SEATS CHECK ---
    const [tenant, userCount] = await Promise.all([
      (prisma.tenant as any).findUnique({
      where: { id: tenantId },
      select: { seatsAllowed: true, seatsUsed: true, plan: true }
      }),
      (prisma.user as any).count({ where: { tenantId } })
    ]);

    const effectiveSeatsAllowed = resolveEffectiveSeatAllowance(
      tenant?.plan || 'free',
      tenant?.seatsAllowed
    );

    if (tenant && !isUnlimitedLimit(effectiveSeatsAllowed) && userCount >= effectiveSeatsAllowed) {
      await logAudit({
        tenantId,
        userId: req.user!.userId,
        action: 'seat_limit_reached',
        resource: 'tenant',
        detail: { seatsUsed: userCount, seatsAllowed: effectiveSeatsAllowed }
      });
      return res.status(403).json({ error: 'No seats available. Please upgrade your plan.' });
    }
    // -------------------

    const existingUser = await (prisma.user as any).findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'Email already registered' });

    const existingInvite = await (prisma.invitation as any).findFirst({
      where: { tenantId, email, status: 'pending' },
    });
    if (existingInvite) return res.status(400).json({ error: 'Invitation already exists for this email' });

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // The current schema links Invitation.email to User.email.
    // Create a suspended placeholder user so invites remain valid without breaking the FK.
    const placeholderPassword = crypto.randomUUID();
    await (prisma.user as any).create({
      data: {
        email,
        password: placeholderPassword,
        role,
        tenantId,
        suspended: true,
      }
    });

    const invitation = await (prisma.invitation as any).create({
      data: {
        tenantId,
        email,
        role,
        status: 'pending',
        invitedById: req.user!.userId,
        token,
        expiresAt,
      },
    });

    await logAudit({
      tenantId,
      userId: req.user!.userId,
      action: 'team.invite.create',
      resource: `invitation:${invitation.id}`,
      detail: { invitedEmail: email, role },
    });

    // TODO(V1): Integrate email delivery here via external service (e.g., SendGrid/AWS SES)
    logger.info('[Simulated Email Dispatch] Invitation created', { 
      to: email, 
      token, 
      link: `http://localhost:3001/accept-invite?token=${token}` 
    });

    return res.status(201).json({ message: 'Invitation created', invitationId: invitation.id });
  } catch (err: any) {
    logger.error('Error creating invitation', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

// PUT /team/:userId/role — Change a user's role (ADMIN, MANAGER)
router.put('/:userId/role', requireRole('ADMIN', 'MANAGER'), requireSensitiveMfa(), validate(changeRoleSchema), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { userId } = req.params;
    const { role } = req.body;

    // Prevent self-demotion
    if (userId === req.user!.userId) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    const target = await (prisma.user as any).findFirst({ where: { id: userId, tenantId } });
    if (!target) return res.status(404).json({ error: 'User not found in this workspace' });

    // MANAGER role restrictions
    if (req.user!.role === 'MANAGER') {
      if (target.role === 'ADMIN') {
        return res.status(403).json({ error: 'Managers cannot modify Admin roles' });
      }
      if (role === 'ADMIN') {
        return res.status(403).json({ error: 'Managers cannot promote users to Admin' });
      }
    }

    const updated = await (prisma.user as any).update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, role: true },
    });

    await logAudit({
      tenantId,
      userId: req.user!.userId,
      action: 'team.role.change',
      resource: `user:${userId}`,
      detail: { oldRole: target.role, newRole: role },
    });

    logger.info('User role updated', { tenantId, targetUser: userId, newRole: role });
    return res.json(updated);
  } catch (err: any) {
    logger.error('Error changing role', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

// DELETE /team/:userId — Remove user from tenant (ADMIN only)
router.delete('/:userId', requireRole('ADMIN'), requireSensitiveMfa(), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { userId } = req.params;

    // Prevent self-deletion
    if (userId === req.user!.userId) {
      return res.status(400).json({ error: 'Cannot remove yourself' });
    }

    const target = await (prisma.user as any).findFirst({ where: { id: userId, tenantId } });
    if (!target) return res.status(404).json({ error: 'User not found in this workspace' });

    await (prisma.user as any).delete({ where: { id: userId } });

    // Decrement seats used
    await (prisma.tenant as any).update({
      where: { id: tenantId },
      data: { seatsUsed: { decrement: 1 } },
    });

    await logAudit({
      tenantId,
      userId: req.user!.userId,
      action: 'team.member.remove',
      resource: `user:${userId}`,
      detail: { removedEmail: target.email },
    });

    logger.info('User removed from tenant', { tenantId, removedUser: userId });
    return res.json({ message: 'User removed from workspace' });
  } catch (err: any) {
    logger.error('Error removing user', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
