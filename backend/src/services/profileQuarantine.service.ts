import fs from 'fs-extra';
import path from 'path';
import { config } from '../config';
import { logAudit } from './audit.service';
import { NotificationCenterService } from './notificationCenter.service';

export interface ProfileQuarantineState {
  profileId: string;
  tenantId: string;
  active: boolean;
  reason: string;
  actorUserId: string;
  createdAt: string;
  releasedAt: string | null;
}

export class ProfileQuarantineService {
  static async get(profileId: string): Promise<ProfileQuarantineState | null> {
    try {
      return await fs.readJson(this.filePath(profileId));
    } catch {
      return null;
    }
  }

  static async quarantine(profileId: string, tenantId: string, actorUserId: string, reason: string) {
    const state: ProfileQuarantineState = {
      profileId,
      tenantId,
      active: true,
      reason,
      actorUserId,
      createdAt: new Date().toISOString(),
      releasedAt: null,
    };
    await fs.ensureDir(path.dirname(this.filePath(profileId)));
    await fs.writeJson(this.filePath(profileId), state, { spaces: 2 });
    await Promise.resolve(NotificationCenterService.push(tenantId, {
      kind: 'security',
      title: `Profile ${profileId} quarantined`,
      body: reason,
      severity: 'warning',
    })).catch(() => undefined);
    await logAudit({
      tenantId,
      userId: actorUserId,
      action: 'profile.quarantine.enabled',
      resource: `profile:${profileId}`,
      detail: { reason },
    });
    return state;
  }

  static async release(profileId: string, tenantId: string, actorUserId: string, reason = 'manual-release') {
    const current = await this.get(profileId);
    const next: ProfileQuarantineState = {
      profileId,
      tenantId,
      active: false,
      reason,
      actorUserId,
      createdAt: current?.createdAt || new Date().toISOString(),
      releasedAt: new Date().toISOString(),
    };
    await fs.ensureDir(path.dirname(this.filePath(profileId)));
    await fs.writeJson(this.filePath(profileId), next, { spaces: 2 });
    await logAudit({
      tenantId,
      userId: actorUserId,
      action: 'profile.quarantine.released',
      resource: `profile:${profileId}`,
      detail: { reason },
    });
    return next;
  }

  static async assertLaunchAllowed(profileId: string) {
    const current = await this.get(profileId);
    if (current?.active) {
      throw new Error(`Profile is quarantined: ${current.reason}`);
    }
  }

  static async summarize(tenantId: string, profileIds: string[]) {
    const states = (await Promise.all(profileIds.map((profileId) => this.get(profileId)))).filter(Boolean) as ProfileQuarantineState[];
    const active = states.filter((item) => item.tenantId === tenantId && item.active);
    return {
      totalTracked: states.length,
      activeCount: active.length,
      items: active.slice(0, 12),
    };
  }

  private static filePath(profileId: string) {
    return path.resolve(config.profileStateDir, 'quarantine', `${profileId}.json`);
  }
}
