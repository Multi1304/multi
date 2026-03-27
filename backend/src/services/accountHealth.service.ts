import { prisma } from '../prisma';

export class AccountHealthService {
  static async summarizeByTenant(tenantId: string) {
    const accounts = await (prisma.account as any).findMany({
      where: { tenantId },
      select: {
        id: true,
        username: true,
        profileId: true,
        verified: true,
        used: true,
        inboxStatus: true,
        lastInboxCheck: true,
        lastVictoryAt: true,
      },
      take: 200,
    }).catch(() => []);

    const rows = accounts.map((account: any) => {
      let score = 50;
      if (account.verified) score += 20;
      if (account.used) score += 10;
      if (account.inboxStatus === 'healthy') score += 15;
      if (account.inboxStatus === 'warning') score -= 10;
      if (account.inboxStatus === 'blocked') score -= 30;
      if (account.lastVictoryAt) score += 5;
      return {
        ...account,
        score: Math.max(0, Math.min(100, score)),
      };
    });

    return {
      weakest: rows.slice().sort((a: any, b: any) => a.score - b.score).slice(0, 8),
      strongest: rows.slice().sort((a: any, b: any) => b.score - a.score).slice(0, 8),
      averageScore: rows.length ? Math.round(rows.reduce((sum: number, row: any) => sum + row.score, 0) / rows.length) : 0,
    };
  }
}
