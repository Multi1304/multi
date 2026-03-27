import { Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import { AuthRequest } from './auth';
import { logger } from '../utils/logger';

/**
 * Checks if the global Kill Switch (`platform.enabled`) is flipped off.
 * Bypasses /health, /admin, and specific auth routes to allow recovery.
 */
export async function killSwitchMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const path = req.originalUrl;
  if (
    path.startsWith('/health') ||
    path.startsWith('/api/health') ||
    path.startsWith('/admin') ||
    path.startsWith('/api/admin') ||
    path.startsWith('/auth') ||
    path.startsWith('/api/auth')
  ) {
    return next();
  }

  try {
    const flag = await prisma.featureFlag.findFirst({
      where: {
        tenantId: null,
        key: 'platform.enabled'
      }
    });

    // If the flag explicitly exists and is set to false, trigger Kill Switch
    if (flag && flag.enabled === false) {
       logger.warn('Killswitch engaged blocking request', { endpoint: req.originalUrl, ip: req.ip });
       return res.status(503).json({ error: 'Service Unavailable - Platform is currently disabled by administrators.' });
    }
  } catch (error) {
     logger.error('Error checking kill switch flag', { error: (error as Error).message });
  }
  
  next();
}
