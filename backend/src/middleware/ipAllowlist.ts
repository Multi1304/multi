import { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { logger } from '../utils/logger';

type AllowlistType = 'admin' | 'sensitive';

function normalizeIp(ip?: string | null) {
  if (!ip) return '';
  return ip.replace('::ffff:', '').trim();
}

function ipToLong(ip: string) {
  const parts = ip.split('.').map((value) => Number.parseInt(value, 10));
  if (parts.length !== 4 || parts.some((value) => Number.isNaN(value) || value < 0 || value > 255)) {
    return null;
  }
  return ((parts[0] << 24) >>> 0) + ((parts[1] << 16) >>> 0) + ((parts[2] << 8) >>> 0) + parts[3];
}

function matchesRule(ip: string, rule: string) {
  const normalizedRule = rule.trim().toLowerCase();
  if (!normalizedRule) return false;

  if (normalizedRule === 'localhost') {
    return ip === '127.0.0.1' || ip === '::1';
  }

  if (normalizedRule === 'private') {
    return (
      ip.startsWith('10.') ||
      ip.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip) ||
      ip === '127.0.0.1'
    );
  }

  if (normalizedRule.includes('/')) {
    const [base, maskString] = normalizedRule.split('/');
    const ipLong = ipToLong(ip);
    const baseLong = ipToLong(base);
    const maskBits = Number.parseInt(maskString, 10);
    if (ipLong === null || baseLong === null || Number.isNaN(maskBits) || maskBits < 0 || maskBits > 32) {
      return false;
    }
    const mask = maskBits === 0 ? 0 : (~((1 << (32 - maskBits)) - 1)) >>> 0;
    return (ipLong & mask) === (baseLong & mask);
  }

  return ip === normalizedRule;
}

export function isIpAllowed(ip: string, rules: string[]) {
  if (rules.length === 0) return true;
  const normalizedIp = normalizeIp(ip);
  return rules.some((rule) => matchesRule(normalizedIp, rule));
}

function getRules(type: AllowlistType) {
  return type === 'admin' ? config.security.adminIpAllowlist : config.security.sensitiveIpAllowlist;
}

export function ipAllowlistGuard(type: AllowlistType, surfaceName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const rules = getRules(type);
    if (rules.length === 0 || config.nodeEnv === 'test') {
      return next();
    }

    const forwardedForHeader = req.headers['x-forwarded-for'];
    const forwardedFor = Array.isArray(forwardedForHeader)
      ? forwardedForHeader[0]
      : String(forwardedForHeader || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)[0];
    const candidateIp = normalizeIp(forwardedFor || req.ip || req.socket.remoteAddress || '');

    if (isIpAllowed(candidateIp, rules)) {
      return next();
    }

    logger.warn('IP allowlist blocked request', {
      surfaceName,
      type,
      ip: candidateIp,
      path: req.originalUrl,
    });
    return res.status(403).json({
      error: `${surfaceName} is not available from this IP address.`,
    });
  };
}
