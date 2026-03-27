import { Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import { AuthRequest } from './auth';
import { TotpService } from '../services/totp.service';
import { config } from '../config';

function extractMfaCode(req: AuthRequest) {
  const headerValue = req.headers['x-mfa-code'];
  if (typeof headerValue === 'string' && headerValue.trim()) {
    return headerValue.trim();
  }

  const bodyValue = (req.body as any)?.mfaCode;
  if (typeof bodyValue === 'string' && bodyValue.trim()) {
    return bodyValue.trim();
  }

  return null;
}

export function requireSensitiveMfa() {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!config.security.requireSensitiveMfa) {
      return next();
    }

    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, role: true, mfaEnabled: true, mfaSecret: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const mustRequireMfaSetup =
      ['ADMIN', 'MANAGER', 'AUDITOR'].includes(user.role) &&
      !user.mfaEnabled;

    if (mustRequireMfaSetup) {
      return res.status(428).json({
        error: 'Multi-factor authentication must be enabled for this action.',
        mfaSetupRequired: true,
      });
    }

    if (!user.mfaEnabled || !user.mfaSecret) {
      return next();
    }

    const code = extractMfaCode(req);
    if (!code) {
      return res.status(428).json({
        error: 'MFA code required for this action.',
        mfaRequired: true,
      });
    }

    if (!TotpService.verify(user.mfaSecret, code)) {
      return res.status(403).json({
        error: 'Invalid MFA code.',
        mfaRequired: true,
      });
    }

    return next();
  };
}
