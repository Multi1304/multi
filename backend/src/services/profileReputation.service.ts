import { prisma } from '../prisma';
import { ProfileDoctorService } from './profileDoctor.service';
import { ProfileTimelineService } from './profileTimeline.service';
import { WarmupLearningService } from './warmupLearning.service';

export class ProfileReputationService {
  static async scoreProfile(profileId: string, tenantId: string) {
    const [profile, doctor, timeline, accounts, warmupLearning] = await Promise.all([
      (prisma.profile as any).findUnique({
        where: { id: profileId },
        select: { id: true, name: true, createdAt: true, platform: true },
      }),
      ProfileDoctorService.evaluate(profileId, tenantId),
      ProfileTimelineService.getTimeline(profileId, tenantId),
      (prisma.account as any).findMany({
        where: { tenantId, profileId },
        select: { verified: true, inboxStatus: true, used: true },
      }).catch(() => []),
      WarmupLearningService.summarizeProfile(tenantId, profileId).catch(() => null),
    ]);

    if (!profile) {
      throw new Error(`Profile ${profileId} not found`);
    }

    const ageDays = Math.max(0, Math.floor((Date.now() - new Date(profile.createdAt).getTime()) / (24 * 60 * 60 * 1000)));
    const accountBonus = accounts.reduce((sum: number, item: any) => {
      let next = sum;
      if (item.verified) next += 4;
      if (item.used) next += 2;
      if (item.inboxStatus === 'healthy') next += 3;
      if (item.inboxStatus === 'blocked') next -= 5;
      return next;
    }, 0);
    const activityBonus = Math.min(10, timeline.items.length);
    const warmupLearningBonus = warmupLearning
      ? Math.max(-8, Math.min(8, warmupLearning.averageDelta + (warmupLearning.improved - warmupLearning.worsened)))
      : 0;
    const reputationScore = Math.max(0, Math.min(100, doctor.healthScore + Math.min(15, ageDays) + accountBonus + activityBonus + warmupLearningBonus));

    return {
      profileId,
      name: profile.name,
      platform: profile.platform,
      reputationScore,
      tier: reputationScore >= 90 ? 'high_value' : reputationScore >= 75 ? 'trusted' : reputationScore >= 55 ? 'standard' : 'fragile',
      ageDays,
      doctorStatus: doctor.status,
      warmupLearning,
      notes: [
        ...doctor.recommendations.slice(0, 2),
        warmupLearning?.completed
          ? `Warmup learning: ${warmupLearning.improved} improved, ${warmupLearning.worsened} worsened, average delta ${warmupLearning.averageDelta}.`
          : null,
      ].filter(Boolean),
    };
  }

  static async rankTenant(tenantId: string) {
    const profiles = await (prisma.profile as any).findMany({
      where: { tenantId },
      select: { id: true },
      take: 60,
    }).catch(() => []);

    const rows = await Promise.all(
      profiles.map((profile: any) => this.scoreProfile(profile.id, tenantId).catch(() => null))
    );

    const valid = rows.filter(Boolean);
    return {
      top: valid.slice().sort((a: any, b: any) => b.reputationScore - a.reputationScore).slice(0, 8),
      fragile: valid.slice().sort((a: any, b: any) => a.reputationScore - b.reputationScore).slice(0, 8),
      improving: valid
        .filter((item: any) => (item.warmupLearning?.averageDelta || 0) > 0)
        .slice()
        .sort((a: any, b: any) => (b.warmupLearning?.averageDelta || 0) - (a.warmupLearning?.averageDelta || 0))
        .slice(0, 6),
      degrading: valid
        .filter((item: any) => (item.warmupLearning?.averageDelta || 0) < 0 || item.warmupLearning?.lastOutcome === 'worsened')
        .slice()
        .sort((a: any, b: any) => (a.warmupLearning?.averageDelta || 0) - (b.warmupLearning?.averageDelta || 0))
        .slice(0, 6),
      averageScore: valid.length ? Math.round(valid.reduce((sum: number, item: any) => sum + item.reputationScore, 0) / valid.length) : 0,
    };
  }
}
