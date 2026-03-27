import { prisma } from '../prisma';
import { ProfileStateService } from './profileState.service';
import { ProfileConsistencyService } from './profileConsistency.service';
import { NotificationCenterService } from './notificationCenter.service';

export class ProfileDoctorService {
  static async evaluate(profileId: string, tenantId: string) {
    const [profile, state, consistency, siblings] = await Promise.all([
      (prisma.profile as any).findUnique({
        where: { id: profileId },
        select: {
          id: true,
          name: true,
          fingerprint: true,
          proxyConfig: true,
          fingerprintPresetId: true,
        },
      }),
      ProfileStateService.getStateSummary(profileId, tenantId),
      ProfileConsistencyService.getSummary(profileId, tenantId),
      (prisma.profile as any).findMany({
        where: { tenantId, NOT: { id: profileId } },
        select: {
          id: true,
          name: true,
          fingerprint: true,
          proxyConfig: true,
          fingerprintPresetId: true,
        },
        take: 150,
      }).catch(() => []),
    ]);

    if (!profile) {
      throw new Error(`Profile ${profileId} not found`);
    }

    const overlap = findOverlap(profile, siblings);
    let score = 100;
    if (state.diff?.status === 'diverged') score -= 20;
    if (state.runtimeLease?.locked) score -= 5;
    if (consistency.status === 'drifted') score -= 15;
    if (overlap.sharedFingerprintCount > 0) score -= 20;
    if (overlap.sharedProxyCount > 0) score -= 10;

    const recommendations = [];
    if (state.diff?.status === 'diverged') recommendations.push('Sync or pull cloud state before the next critical launch.');
    if (consistency.status === 'drifted') recommendations.push('Keep fingerprint and sticky proxy stable until the consistency window expires.');
    if (overlap.sharedFingerprintCount > 0) recommendations.push('Decouple cloned profiles by reseeding fingerprint hints before using them heavily.');
    if (overlap.sharedProxyCount > 0) recommendations.push('Spread sibling profiles across different endpoints or pools to reduce internal correlation risk.');
    if (recommendations.length === 0) recommendations.push('Profile is healthy enough for routine use. Preserve its current routing and fingerprint baseline.');

    const result = {
      profileId,
      healthScore: Math.max(0, Math.min(100, score)),
      status: score >= 85 ? 'healthy' : score >= 65 ? 'watch' : 'needs_attention',
      overlap,
      consistency,
      recommendations,
      generatedAt: new Date().toISOString(),
    };

    if (result.status !== 'healthy') {
      await Promise.resolve(NotificationCenterService.push(tenantId, {
        kind: 'profile',
        title: `Profile doctor flagged ${profile.name}`,
        body: recommendations[0],
        severity: result.status === 'needs_attention' ? 'warning' : 'info',
      })).catch(() => undefined);
    }

    return result;
  }
}

function fingerprintSignature(profile: any) {
  const fingerprint = profile?.fingerprint || {};
  return JSON.stringify({
    canvasSeed: fingerprint.canvasSeed || null,
    webglVendor: fingerprint.webglVendor || fingerprint.webgl?.vendor || null,
    webglRenderer: fingerprint.webglRenderer || fingerprint.webgl?.renderer || null,
    hardwareConcurrency: fingerprint.hardwareConcurrency || null,
    timezone: fingerprint.timezoneId || fingerprint.timezone || null,
  });
}

function proxySignature(profile: any) {
  const proxy = profile?.proxyConfig || {};
  return JSON.stringify({
    host: proxy.host || proxy.server || null,
    port: proxy.port || null,
    username: proxy.username || null,
  });
}

function findOverlap(profile: any, siblings: any[]) {
  const currentFingerprint = fingerprintSignature(profile);
  const currentProxy = proxySignature(profile);
  const sameFingerprint = siblings.filter((item) => fingerprintSignature(item) === currentFingerprint);
  const sameProxy = siblings.filter((item) => proxySignature(item) === currentProxy);

  return {
    sharedFingerprintCount: sameFingerprint.length,
    sharedProxyCount: sameProxy.length,
    sampleProfiles: [...sameFingerprint, ...sameProxy].slice(0, 6).map((item) => ({
      id: item.id,
      name: item.name,
      fingerprintPresetId: item.fingerprintPresetId || null,
    })),
  };
}
