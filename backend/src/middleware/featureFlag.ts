import { Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import { AuthRequest } from './auth';
import { logger } from '../utils/logger';

/**
 * Validates if a specific feature is globally or tenant-level disabled.
 * Factory pattern to generate middleware per route.
 */
export function requireFeatureFlag(featureKey: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // 1. Check Global Explicit Override
      const globalFlag = await prisma.featureFlag.findFirst({
        where: { tenantId: null, key: featureKey }
      });
      if (globalFlag && globalFlag.enabled === false) {
        logger.warn(`Feature ${featureKey} disabled globally`, { endpoint: req.originalUrl });
        return res.status(403).json({ error: `Feature disabled globally` });
      }

      // 2. Check Tenant Explicit Override if authenticated
      if (req.user && req.user.tenantId) {
        const tenantFlag = await prisma.featureFlag.findUnique({
          where: {
             tenantId_key: {
               tenantId: req.user.tenantId,
               key: featureKey
             }
          }
        });
        if (tenantFlag && tenantFlag.enabled === false) {
           logger.warn(`Feature ${featureKey} disabled for tenant`, { tenantId: req.user.tenantId });
           return res.status(403).json({ error: `Feature is not enabled for your workspace` });
        }
      }

      next();
    } catch (e) {
      next(e);
    }
  };
}
