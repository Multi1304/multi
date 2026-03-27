import { prisma } from '../prisma';
import { encryptSecret, isEncryptedSecret } from '../utils/cryptoVault';

export type AccountInboxStatus =
  | 'unknown'
  | 'pending_check'
  | 'verified'
  | 'failed'
  | 'disabled';

export interface AccountStatePatch {
  used?: boolean;
  verified?: boolean;
  inboxStatus?: AccountInboxStatus;
  lastInboxCheck?: string | Date | null;
  lastVictoryAt?: string | Date | null;
  state?: Record<string, any> | null;
}

export class AccountStateService {
  static normalizeAccount(account: any) {
    const state = account?.state && typeof account.state === 'object' ? account.state : {};
    return {
      ...account,
      credentialStorage: account?.credentialStorage || (isEncryptedSecret(account?.password) ? 'encrypted-vault' : 'legacy'),
      used: account?.used === true,
      verified: account?.verified === true,
      inboxStatus: account?.inboxStatus || 'unknown',
      lastInboxCheck: account?.lastInboxCheck || null,
      lastVictoryAt: account?.lastVictoryAt || null,
      state,
    };
  }

  static buildStatePatch(patch: AccountStatePatch) {
    const data: any = {};
    if (typeof patch.used === 'boolean') data.used = patch.used;
    if (typeof patch.verified === 'boolean') data.verified = patch.verified;
    if (typeof patch.inboxStatus === 'string') data.inboxStatus = patch.inboxStatus;
    if (patch.lastInboxCheck !== undefined) data.lastInboxCheck = patch.lastInboxCheck ? new Date(patch.lastInboxCheck) : null;
    if (patch.lastVictoryAt !== undefined) data.lastVictoryAt = patch.lastVictoryAt ? new Date(patch.lastVictoryAt) : null;
    if (patch.state !== undefined) data.state = patch.state as any;
    return data;
  }

  static async updateAccountState(accountId: string, tenantId: string, patch: AccountStatePatch) {
    const account = await (prisma.account as any).findFirst({
      where: { id: accountId, tenantId }
    });
    if (!account) throw new Error('Account not found');

    const mergedState = {
      ...((account.state as any) || {}),
      ...((patch.state as any) || {}),
    };

    const updated = await (prisma.account as any).update({
      where: { id: accountId },
      data: {
        ...this.buildStatePatch({ ...patch, state: mergedState }),
      },
      include: { profile: true }
    });

    return this.normalizeAccount(updated);
  }

  static async persistFlowOutcome(params: {
    tenantId: string;
    flowRunId: string;
    variables: Record<string, any>;
    result: Record<string, any>;
  }) {
    const profileId = params.variables.profileId || params.result.profileId || null;
    const username = params.variables.email || params.variables.username || params.result.email || params.result.username || null;
    const password = params.variables.password || params.result.password || null;

    if (!profileId || !username || !password) {
      return null;
    }

    const encryptedPassword = isEncryptedSecret(password) ? password : encryptSecret(password);
    const verified = Boolean(params.result.confirmedSuccess || params.result.inboxVerified);
    const inboxStatus: AccountInboxStatus = params.result.inboxVerified
      ? 'verified'
      : params.result.confirmedSuccess
        ? 'pending_check'
        : 'unknown';

    const existing = await (prisma.account as any).findFirst({
      where: {
        tenantId: params.tenantId,
        profileId,
        username,
      }
    });

    const statePayload = {
      source: 'flow',
      flowRunId: params.flowRunId,
      confirmedSuccess: !!params.result.confirmedSuccess,
      inboxVerified: !!params.result.inboxVerified,
      updatedAt: new Date().toISOString(),
    };

    const data = {
      username,
      password: encryptedPassword,
      credentialStorage: 'encrypted-vault',
      used: false,
      verified,
      inboxStatus,
      lastInboxCheck: params.result.inboxVerified ? new Date() : null,
      lastVictoryAt: params.result.confirmedSuccess ? new Date() : null,
      state: statePayload as any,
      tenantId: params.tenantId,
      profileId,
    };

    const saved = existing
      ? await (prisma.account as any).update({
          where: { id: existing.id },
          data,
          include: { profile: true }
        })
      : await (prisma.account as any).create({
          data,
          include: { profile: true }
        });

    return this.normalizeAccount(saved);
  }
}
