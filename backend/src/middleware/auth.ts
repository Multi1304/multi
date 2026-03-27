import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../utils/auth';
import { prisma } from '../prisma';
import crypto from 'crypto';
import { CanaryTrapService } from '../services/canaryTrap.service';

export interface AuthRequest extends Request {
  user?: TokenPayload;
  authType?: 'token' | 'api_key';
  apiKeyId?: string;
  apiKeyScopes?: string[];
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = header.substring('Bearer '.length).trim();

  try {
    const payload = verifyToken(token);
    req.user = payload;
    req.authType = 'token';
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/** Role-based access control middleware */
export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const userRole = req.user.role || 'USER';
    if (!roles.includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

/** API Key authentication middleware */
export async function apiKeyAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string;
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing API Key' });
  }

  try {
    const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');
    const keyData = await (prisma as any).apiKey.findUnique({
      where: { key: hashedKey },
      include: { user: true }
    });

    if (!keyData) {
      return res.status(401).json({ error: 'Invalid API Key' });
    }

    if (keyData.expiresAt && keyData.expiresAt < new Date()) {
      return res.status(401).json({ error: 'API Key expired' });
    }

    // Populate req.user to maintain compatibility
    req.user = {
      userId: keyData.userId,
      tenantId: keyData.tenantId,
      role: keyData.user.role as any,
    };
    req.authType = 'api_key';
    req.apiKeyId = keyData.id;
    req.apiKeyScopes = Array.isArray(keyData.scopes) ? keyData.scopes : [];

    if (req.apiKeyScopes.includes('canary:trip')) {
      await CanaryTrapService.tripCanaryApiKey({
        tenantId: keyData.tenantId,
        userId: keyData.userId,
        apiKeyId: keyData.id,
        keyName: keyData.name,
        ipAddress: req.ip || req.socket.remoteAddress,
        userAgent: String(req.headers['user-agent'] || ''),
      });
      return res.status(403).json({ error: 'API Key disabled' });
    }

    // Update last used
    await (prisma as any).apiKey.update({
      where: { id: keyData.id },
      data: { lastUsed: new Date() }
    });

    next();
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error during API key validation' });
  }
}

function scopeImplies(scope: string, requiredScope: string) {
  if (scope === 'admin' || scope === '*') return true;
  if (scope === requiredScope) return true;

  const [requiredResource, requiredAction] = requiredScope.split(':');
  if (!requiredAction) {
    return scope === requiredResource;
  }

  if (scope === requiredAction) return true;
  if (scope === `${requiredResource}:*`) return true;
  if (scope === 'write' && (requiredAction === 'write' || requiredAction === 'read' || requiredAction === 'execute')) return true;
  if (scope === 'read' && requiredAction === 'read') return true;
  if (scope === 'execute' && requiredAction === 'execute') return true;
  return false;
}

export function requireApiKeyScope(requiredScope: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.authType !== 'api_key') {
      return next();
    }

    const scopes = req.apiKeyScopes || [];
    const allowed = scopes.some((scope) => scopeImplies(scope, requiredScope));
    if (!allowed) {
      return res.status(403).json({
        error: `API key is missing required scope: ${requiredScope}`,
      });
    }
    return next();
  };
}

/** Unified auth middleware (Bearer OR API Key) */
export async function unifiedAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers['x-api-key'];

  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authMiddleware(req, res, next);
  } else if (apiKeyHeader) {
    return apiKeyAuth(req, res, next);
  } else {
    return res.status(401).json({ error: 'Authentication required (Bearer token or API Key)' });
  }
}
