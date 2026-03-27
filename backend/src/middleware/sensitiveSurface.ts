import { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { logger } from '../utils/logger';

function isLoopbackAddress(ip?: string | null) {
  if (!ip) return false;
  const normalized = ip.replace('::ffff:', '');
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === '::ffff:127.0.0.1';
}

export function sensitiveSurfaceGuard(surfaceName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (config.nodeEnv === 'test') {
      return next();
    }

    if (config.security.allowRemoteSensitiveSurfaces) {
      return next();
    }

    const forwardedForHeader = req.headers['x-forwarded-for'];
    const forwardedFor = Array.isArray(forwardedForHeader)
      ? forwardedForHeader[0]
      : String(forwardedForHeader || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)[0];
    const candidateIp = forwardedFor || req.ip || req.socket.remoteAddress || null;

    if (isLoopbackAddress(candidateIp)) {
      return next();
    }

    logger.warn('Sensitive surface blocked for non-local request', {
      surfaceName,
      ip: candidateIp,
      path: req.originalUrl,
    });
    return res.status(403).json({
      error: `${surfaceName} is only available from localhost by default.`,
    });
  };
}
