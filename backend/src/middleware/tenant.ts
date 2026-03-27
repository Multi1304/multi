import { Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import { AuthRequest } from './auth';

/**
 * Validates if the user's workspace is currently suspended by administrators.
 * Returns 403 Forbidden on all business logical requests if true.
 */
export async function tenantSuspensionMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  // If no user context, just continue to let auth block it or resolve as public
  if (!req.user || !req.user.tenantId) {
    return next();
  }

  try {
    const tenant = await prisma.tenant.findUnique({
       where: { id: req.user.tenantId },
       select: { suspended: true }
    });

    if (tenant && tenant.suspended) {
       return res.status(403).json({ error: 'Tenant suspended. Contact platform administrators.' });
    }
  } catch (error) {
    // If Prisma drops, we skip and let global error handler catch downstream if DB is broken
  }
  
  next();
}
