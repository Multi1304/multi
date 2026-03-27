import { NextFunction, Response } from 'express';
import { AuthRequest } from './auth';
import { StepUpAuthService } from '../services/stepUpAuth.service';
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

export function requireStepUp(actionKey: string, options?: { always?: boolean; riskThreshold?: number }) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (config.nodeEnv === 'test') {
      (req as any).stepUp = {
        required: false,
        satisfied: true,
        reason: 'none',
        ttlMinutes: config.security.stepUpTtlMinutes,
        risk: null,
      };
      return next();
    }

    const evaluation = await StepUpAuthService.evaluate({
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      role: req.user.role || 'USER',
      actionKey,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: String(req.headers['user-agent'] || ''),
      always: options?.always,
      riskThreshold: options?.riskThreshold,
    });

    (req as any).stepUp = evaluation;
    if (!evaluation.required || evaluation.satisfied) {
      return next();
    }

    const code = extractMfaCode(req);
    if (!code) {
      return res.status(428).json({
        error: 'Step-up authentication required.',
        stepUpRequired: true,
        actionKey,
        ttlMinutes: evaluation.ttlMinutes,
        risk: evaluation.risk,
      });
    }

    const verified = await StepUpAuthService.verifyAndGrant({
      tenantId: req.user.tenantId,
      userId: req.user.userId,
      actionKey,
      code,
    });

    if (!verified.ok) {
      return res.status(403).json({
        error: verified.error,
        stepUpRequired: true,
        actionKey,
      });
    }

    return next();
  };
}
