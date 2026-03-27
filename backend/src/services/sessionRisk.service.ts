import { prisma } from '../prisma';

export interface SessionRiskResult {
  score: number;
  level: 'low' | 'medium' | 'high';
  reasons: string[];
}

function normalizeIp(ip?: string | null) {
  if (!ip) return '';
  return ip.replace('::ffff:', '').trim();
}

export class SessionRiskService {
  static async evaluate(userId: string, ip?: string | null, userAgent?: string | null, role?: string | null): Promise<SessionRiskResult> {
    const sessions = await prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { ipAddress: true, userAgent: true, createdAt: true },
    });

    const reasons: string[] = [];
    let score = 0;
    const currentIp = normalizeIp(ip);
    const currentAgent = String(userAgent || '').trim();

    if (sessions.length === 0) {
      score += 25;
      reasons.push('No historical session baseline available');
    }

    const matchingIp = sessions.some((session) => normalizeIp(session.ipAddress) === currentIp && currentIp);
    const matchingUserAgent = sessions.some((session) => String(session.userAgent || '').trim() === currentAgent && currentAgent);

    if (currentIp && !matchingIp) {
      score += 35;
      reasons.push('Request IP does not match recent sessions');
    }

    if (currentAgent && !matchingUserAgent) {
      score += 25;
      reasons.push('User agent does not match recent sessions');
    }

    if (sessions.length >= 3) {
      score += 10;
      reasons.push('Several active sessions already exist');
    }

    if (role === 'ADMIN' && currentIp && currentIp !== '127.0.0.1' && currentIp !== '::1') {
      score += 10;
      reasons.push('Admin session is operating from a non-local address');
    }

    const level: SessionRiskResult['level'] =
      score >= 70 ? 'high' : score >= 35 ? 'medium' : 'low';

    return { score, level, reasons };
  }
}
