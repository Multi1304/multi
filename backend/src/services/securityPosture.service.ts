import { prisma } from '../prisma';
import { config } from '../config';

function isLoopbackHost(host: string) {
  return host === '127.0.0.1' || host === 'localhost';
}

export class SecurityPostureService {
  static async getSnapshot(tenantId: string) {
    const [admins, mfaEnabledAdmins, apiKeys] = await Promise.all([
      prisma.user.count({ where: { tenantId, role: 'ADMIN' } }),
      prisma.user.count({ where: { tenantId, role: 'ADMIN', mfaEnabled: true } }),
      (prisma as any).apiKey.findMany({
        where: { tenantId },
        select: { id: true, name: true, expiresAt: true, lastUsed: true, createdAt: true, scopes: true },
      }),
    ]);

    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;

    const expiringSoon = apiKeys.filter((key: any) => key.expiresAt && new Date(key.expiresAt).getTime() - now <= sevenDays).length;
    const staleKeys = apiKeys.filter((key: any) => {
      if (key.lastUsed) {
        return now - new Date(key.lastUsed).getTime() > thirtyDays;
      }
      return now - new Date(key.createdAt).getTime() > thirtyDays;
    }).length;

    const remoteExposureDetected = !isLoopbackHost(config.host) || config.security.allowRemoteSensitiveSurfaces;
    const adminAllowlistConfigured = config.security.adminIpAllowlist.length > 0;
    const sensitiveAllowlistConfigured = config.security.sensitiveIpAllowlist.length > 0;
    const mfaCoverage = admins > 0 ? Math.round((mfaEnabledAdmins / admins) * 100) : 100;

    const warnings: string[] = [];
    if (remoteExposureDetected && !adminAllowlistConfigured) {
      warnings.push('Camel appears reachable beyond localhost but admin IP allowlist is not configured.');
    }
    if (remoteExposureDetected && !config.security.requireSensitiveMfa) {
      warnings.push('Remote posture detected without sensitive MFA enforcement.');
    }
    if (mfaCoverage < 100) {
      warnings.push('Not all admin users have MFA enabled.');
    }
    if (expiringSoon > 0) {
      warnings.push(`${expiringSoon} API key(s) expire within 7 days.`);
    }

    return {
      host: config.host,
      remoteExposureDetected,
      adminAllowlistConfigured,
      sensitiveAllowlistConfigured,
      requireSensitiveMfa: config.security.requireSensitiveMfa,
      adminMfaCoverage: mfaCoverage,
      apiKeys: {
        total: apiKeys.length,
        expiringSoon,
        staleKeys,
      },
      warnings,
      summary:
        warnings[0] ||
        'Security posture is within the current guardrails.',
    };
  }
}
