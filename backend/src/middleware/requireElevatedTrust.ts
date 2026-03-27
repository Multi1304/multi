import { Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import { AuthRequest } from './auth';
import { SessionRiskService } from '../services/sessionRisk.service';
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

export function requireElevatedTrust(threshold = 70) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (config.nodeEnv === 'test') {
      (req as any).sessionRisk = {
        score: 0,
        level: 'low',
        reasons: [],
      };
      return next();
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { mfaEnabled: true, mfaSecret: true, role: true },
    });
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const risk = await SessionRiskService.evaluate(
      req.user.userId,
      req.ip || req.socket.remoteAddress,
      String(req.headers['user-agent'] || ''),
      user.role
    );

    (req as any).sessionRisk = risk;
    if (risk.score < threshold) {
      return next();
    }

    if (!user.mfaEnabled || !user.mfaSecret) {
      return res.status(428).json({
        error: 'High-risk session detected. Enable MFA to continue sensitive actions.',
        stepUpRequired: true,
        mfaSetupRequired: true,
        risk,
      });
    }

    const code = extractMfaCode(req);
    if (!code) {
      return res.status(428).json({
        error: 'High-risk session detected. MFA code required.',
        stepUpRequired: true,
        mfaRequired: true,
        risk,
      });
    }

    if (!TotpService.verify(user.mfaSecret, code)) {
      return res.status(403).json({
        error: 'Invalid MFA code for high-risk session.',
        stepUpRequired: true,
        mfaRequired: true,
        risk,
      });
    }

    return next();
  };
}
