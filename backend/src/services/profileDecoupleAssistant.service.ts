import crypto from 'crypto';
import { prisma } from '../prisma';
import { ProfileDoctorService } from './profileDoctor.service';
import { logAudit } from './audit.service';

export class ProfileDecoupleAssistantService {
  static async plan(profileId: string, tenantId: string) {
    const [profile, doctor] = await Promise.all([
      (prisma.profile as any).findUnique({
        where: { id: profileId },
        select: { id: true, name: true, fingerprint: true, proxyConfig: true, fingerprintPresetId: true },
      }),
      ProfileDoctorService.evaluate(profileId, tenantId),
    ]);
    if (!profile) throw new Error(`Profile ${profileId} not found`);

    const fingerprint = profile.fingerprint || {};
    return {
      profileId,
      requiresApproval: true,
      overlap: doctor.overlap,
      fingerprintPatch: {
        canvasSeed: `seed-${crypto.randomBytes(6).toString('hex')}`,
        hardwareConcurrency: pickDifferentNumber(Number(fingerprint.hardwareConcurrency || 8)),
        timezoneId: fingerprint.timezoneId || fingerprint.timezone || null,
      },
      routingAdvice: doctor.overlap.sharedProxyCount > 0 ? 'Move this profile to a different endpoint or sticky binding before heavy use.' : 'Current routing is acceptable.',
      rationale: doctor.recommendations,
    };
  }

  static async apply(profileId: string, tenantId: string, actorUserId: string) {
    const plan = await this.plan(profileId, tenantId);
    const profile = await (prisma.profile as any).findUnique({ where: { id: profileId } });
    if (!profile) throw new Error(`Profile ${profileId} not found`);

    const nextFingerprint = {
      ...(profile.fingerprint || {}),
      ...plan.fingerprintPatch,
      decoupledAt: new Date().toISOString(),
      decoupledBy: actorUserId,
    };

    await (prisma.profile as any).update({
      where: { id: profileId },
      data: {
        fingerprint: nextFingerprint,
      },
    });

    await logAudit({
      tenantId,
      userId: actorUserId,
      action: 'profile.decouple.applied',
      resource: `profile:${profileId}`,
      detail: plan,
    });

    return {
      applied: true,
      plan,
    };
  }
}

function pickDifferentNumber(current: number) {
  const candidates = [4, 6, 8, 10, 12, 16];
  const filtered = candidates.filter((item) => item !== current);
  return filtered[Math.floor(Math.random() * filtered.length)];
}
