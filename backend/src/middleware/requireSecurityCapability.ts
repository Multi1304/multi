import { NextFunction, Response } from 'express';
import { AuthRequest } from './auth';
import { SecurityCapability, SecurityPolicyService } from '../services/securityPolicy.service';

export function requireSecurityCapability(capability: SecurityCapability) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const allowed = await SecurityPolicyService.isCapabilityAllowed(
      req.user.tenantId,
      req.user.role || 'OPERATOR',
      capability
    );

    if (!allowed) {
      return res.status(403).json({
        error: `Security capability denied: ${capability}`,
        capability,
      });
    }

    return next();
  };
}
