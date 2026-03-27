import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { hashPassword, comparePassword, signToken } from '../utils/auth';
import { authMiddleware, AuthRequest, requireRole } from '../middleware/auth';
import { resourceLimitMiddleware } from '../middleware/quota';
import { authLoginLimiter, authRegisterLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { registerSchema, loginSchema, refreshSchema, inviteSchema, forgotPasswordSchema, resetPasswordSchema } from '../schemas';
import { config } from '../config';
import { logger } from '../utils/logger';
import { TotpService } from '../services/totp.service';

const router = Router();

/**
 * Generate a cryptographically secure refresh token.
 */
function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

// POST /auth/register — Create tenant + admin user
router.post('/register', authRegisterLimiter, validate(registerSchema), async (req, res) => {
  try {
    const { tenantName, email, password, termsAccepted } = req.body;

    const existing = await (prisma.user as any).findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    const hashed = await hashPassword(password);

    const tenant = await (prisma.tenant as any).create({
      data: {
        name: tenantName as string,
        slug: (tenantName as string).toLowerCase().replace(/\s+/g, '-') + '-' + Math.random().toString(36).substring(2, 7),
        users: {
          create: {
            email: email as string,
            password: hashed,
            role: 'ADMIN',
          },
        },
      },
      include: { users: true },
    });

    const user = tenant.users[0];
    const accessToken = signToken({ userId: user.id, tenantId: tenant.id, role: user.role });

    // Create session with refresh token
    const refreshToken = generateRefreshToken();
    await prisma.$executeRaw`
      INSERT INTO "Session" ("id", "userId", "token", "refreshToken", "expiresAt", "createdAt", "userAgent", "ipAddress")
      VALUES (
        gen_random_uuid(),
        ${user.id},
        ${accessToken},
        ${refreshToken},
        ${new Date(Date.now() + config.jwt.refreshExpiresMs)},
        NOW(),
        ${req.headers['user-agent'] || null},
        ${req.ip || null}
      )
    `;

    logger.info('Tenant registered', { tenantId: tenant.id, email });

    // Fetch active feature flags for this tenant + global flags
    const activeFlags = await prisma.featureFlag.findMany({
      where: {
        OR: [{ tenantId: tenant.id }, { tenantId: null }],
        enabled: true
      }
    });
    const featureFlags = activeFlags.map(f => f.key);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'strict',
      maxAge: config.jwt.refreshExpiresMs,
    });

    return res.status(201).json({
      token: accessToken,
      tenant: { id: tenant.id, name: tenant.name, plan: tenant.plan },
      user: { id: user.id, email: user.email, role: user.role },
      featureFlags,
    });
  } catch (err: any) {
    logger.error('Registration error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

// POST /auth/login
router.post('/login', authLoginLimiter, validate(loginSchema), async (req, res) => {
  try {
    const { email, password, totpCode } = req.body;

    const user: any = await (prisma.user as any).findUnique({
      where: { email },
      include: { tenant: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if tenant is suspended
    if (user.tenant.suspended) {
      return res.status(403).json({ error: 'Your workspace has been suspended' });
    }

    const ok = await comparePassword(password, user.password);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.mfaEnabled) {
      if (!user.mfaSecret) {
        return res.status(500).json({ error: 'MFA is enabled but not configured correctly' });
      }
      if (!totpCode) {
        return res.status(428).json({ error: 'MFA code required', mfaRequired: true });
      }
      if (!TotpService.verify(user.mfaSecret, totpCode)) {
        return res.status(401).json({ error: 'Invalid MFA code', mfaRequired: true });
      }
    }

    // Enforce simultaneous sessions limit (Max 3)
    const activeSessions = await prisma.session.count({
      where: { userId: user.id }
    });
    
    if (activeSessions >= 3) {
      logger.warn('limit exceeded - Max simultaneous sessions reached', { userId: user.id, activeSessions });
      return res.status(403).json({ error: 'Maximum combined active sessions exceeded (3)' });
    }

    const accessToken = signToken({ userId: user.id, tenantId: user.tenantId, role: user.role });

    // Create session with refresh token
    const refreshToken = generateRefreshToken();
    await prisma.$executeRaw`
      INSERT INTO "Session" ("id", "userId", "token", "refreshToken", "expiresAt", "createdAt", "userAgent", "ipAddress")
      VALUES (
        gen_random_uuid(),
        ${user.id},
        ${accessToken},
        ${refreshToken},
        ${new Date(Date.now() + config.jwt.refreshExpiresMs)},
        NOW(),
        ${req.headers['user-agent'] || null},
        ${req.ip || null}
      )
    `;

    // Update last login
    await (prisma.user as any).update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    logger.info('User logged in', { userId: user.id, tenantId: user.tenantId });

    // Fetch active feature flags
    const activeFlags = await prisma.featureFlag.findMany({
      where: {
        OR: [{ tenantId: user.tenantId }, { tenantId: null }],
        enabled: true
      }
    });
    const featureFlags = activeFlags.map(f => f.key);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'strict',
      maxAge: config.jwt.refreshExpiresMs,
    });

    return res.json({
      token: accessToken,
      tenant: { id: user.tenant.id, name: user.tenant.name, plan: user.tenant.plan },
      user: { id: user.id, email: user.email, role: user.role },
      featureFlags,
    });
  } catch (err: any) {
    console.error('FULL LOGIN ERROR:', err);
    logger.error('Login error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

// POST /auth/refresh — Rotate refresh token and issue new access token
router.post('/refresh', validate(refreshSchema), async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token' });
    }

    const session = await prisma.session.findUnique({
      where: { refreshToken },
      include: { user: { include: { tenant: true } } },
    });

    if (!session || session.expiresAt < new Date()) {
      // Clean up expired session if it exists
      if (session) await prisma.session.delete({ where: { id: session.id } });
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // Check if tenant is suspended
    if (session.user.tenant.suspended) {
      await prisma.session.delete({ where: { id: session.id } });
      return res.status(403).json({ error: 'Workspace suspended' });
    }

    // Generate new tokens
    const newRefreshToken = generateRefreshToken();
    const accessToken = signToken({
      userId: session.user.id,
      tenantId: session.user.tenantId,
      role: session.user.role,
    });

    await prisma.session.delete({ where: { id: session.id } });
    await prisma.$executeRaw`
      INSERT INTO "Session" ("id", "userId", "token", "refreshToken", "expiresAt", "createdAt", "userAgent", "ipAddress")
      VALUES (
        gen_random_uuid(),
        ${session.userId},
        ${accessToken},
        ${newRefreshToken},
        ${new Date(Date.now() + config.jwt.refreshExpiresMs)},
        NOW(),
        ${req.headers['user-agent'] || session.userAgent},
        ${req.ip || session.ipAddress}
      )
    `;

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'strict',
      maxAge: config.jwt.refreshExpiresMs,
    });

    return res.json({
      token: accessToken,
    });
  } catch (err: any) {
    logger.error('Refresh error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

// POST /auth/logout — Revoke refresh token
router.post('/logout', async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      await prisma.session.deleteMany({ where: { refreshToken } });
    }
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: config.nodeEnv === 'production',
      sameSite: 'strict',
    });
    return res.json({ message: 'Logged out' });
  } catch (err: any) {
    logger.error('Logout error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

// GET /auth/sessions — List active sessions for current user
router.get('/sessions', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const sessions = await prisma.session.findMany({
      where: { userId: req.user!.userId },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(sessions);
  } catch (err: any) {
    logger.error('Sessions list error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

// DELETE /auth/sessions/:id — Revoke a specific session (remote logout)
router.delete('/sessions/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const session = await prisma.session.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    await prisma.session.delete({ where: { id: session.id } });
    return res.json({ message: 'Session revoked' });
  } catch (err: any) {
    logger.error('Session revoke error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

// POST /auth/forgot-password — Generate temporary token
router.post('/forgot-password', authLoginLimiter, validate(forgotPasswordSchema), async (req, res) => {
  try {
    const { email } = req.body;
    
    // Find user by email
    const user: any = await (prisma.user as any).findUnique({ where: { email } });
    
    if (user) {
      // Setup reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes
      
      await (prisma.user as any).update({
        where: { id: user.id },
        data: { resetToken, resetTokenExpiresAt },
      });
      
      // Developer log (simulate email dispatch for V1)
      logger.info('[Simulated Email Dispatch] Password recovery token created', { 
        to: email, 
        resetToken, 
        link: `http://localhost:3001/reset-password?token=${resetToken}` 
      });
    } else {
      logger.warn('Password recovery requested for non-existent email', { email });
    }

    // Always return success to prevent email sweeping enumerations
    return res.json({ message: 'If that email exists, a password reset link has been sent.' });

  } catch (err: any) {
    logger.error('Forgot password error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

// POST /auth/reset-password — Consume token to change password
router.post('/reset-password', authLoginLimiter, validate(resetPasswordSchema), async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    const user = await (prisma.user as any).findFirst({
      where: {
        resetToken: token,
        resetTokenExpiresAt: { gt: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired password reset token' });
    }

    const hashed = await hashPassword(newPassword);

    await (prisma.user as any).update({
      where: { id: user.id },
      data: {
        password: hashed,
        resetToken: null,
        resetTokenExpiresAt: null,
        passwordChangedAt: new Date(),
      },
    });

    logger.info('User password reset out-of-band via temp token', { userId: user.id });
    return res.json({ message: 'Password has been successfully reset. You may now login.' });

  } catch (err: any) {
    logger.error('Reset password error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

export default router;

