import fs from 'fs-extra';
import path from 'path';
import { prisma } from '../prisma';
import { config } from '../config';
import { logAudit } from './audit.service';
import { NotificationCenterService } from './notificationCenter.service';
import { PredictiveWarmupService } from './predictiveWarmup.service';
import { WarmupLearningService } from './warmupLearning.service';

export interface PredictiveWarmupSettings {
  tenantId: string;
  approvalsRequired: boolean;
  autoQueueEnabled: boolean;
  nightlyWindowStartHour: number;
  nightlyWindowEndHour: number;
  updatedAt: string;
}

export interface PredictiveWarmupQueueEntry {
  id: string;
  tenantId: string;
  profileId: string;
  profileName: string;
  mode: 'none' | 'light' | 'moderate' | 'overnight';
  status: 'pending_approval' | 'queued' | 'running' | 'completed' | 'cancelled';
  riskBand: string;
  nextWindow: string;
  estimatedDurationMinutes: number;
  readinessAfterWarmup: number;
  createdAt: string;
  approvedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  actorUserId: string | null;
  approvalUserId: string | null;
  feedback: {
    outcome: 'unknown' | 'improved' | 'unchanged' | 'worsened';
    notes: string | null;
    deltaScore: number;
    recordedAt: string | null;
  };
}

export class PredictiveWarmupQueueService {
  static async getSettings(tenantId: string): Promise<PredictiveWarmupSettings> {
    const defaults: PredictiveWarmupSettings = {
      tenantId,
      approvalsRequired: true,
      autoQueueEnabled: true,
      nightlyWindowStartHour: 2,
      nightlyWindowEndHour: 5,
      updatedAt: new Date().toISOString(),
    };

    try {
      const current = await fs.readJson(this.settingsPath(tenantId));
      return { ...defaults, ...current, tenantId };
    } catch {
      return defaults;
    }
  }

  static async updateSettings(
    tenantId: string,
    patch: Partial<PredictiveWarmupSettings>,
    actorUserId: string
  ) {
    const current = await this.getSettings(tenantId);
    const next: PredictiveWarmupSettings = {
      ...current,
      ...patch,
      tenantId,
      nightlyWindowStartHour: clampHour(patch.nightlyWindowStartHour ?? current.nightlyWindowStartHour),
      nightlyWindowEndHour: clampHour(patch.nightlyWindowEndHour ?? current.nightlyWindowEndHour),
      updatedAt: new Date().toISOString(),
    };
    await fs.ensureDir(path.dirname(this.settingsPath(tenantId)));
    await fs.writeJson(this.settingsPath(tenantId), next, { spaces: 2 });
    await logAudit({
      tenantId,
      userId: actorUserId,
      action: 'predictive_warmup.settings.updated',
      resource: 'predictive_warmup:settings',
      detail: next,
    });
    return next;
  }

  static async rebuildNightlyQueue(tenantId: string, actorUserId: string | null = null) {
    const [settings, candidates, current] = await Promise.all([
      this.getSettings(tenantId),
      PredictiveWarmupService.listNightlyCandidates(tenantId),
      this.listQueue(tenantId),
    ]);

    if (!settings.autoQueueEnabled) {
      return {
        settings,
        items: current.items,
        summary: current.summary,
      };
    }

    const activeByProfile = new Map(
      current.items
        .filter((item) => item.status === 'pending_approval' || item.status === 'queued' || item.status === 'running')
        .map((item) => [item.profileId, item])
    );

    const nextItems = current.items.filter((item) => item.status === 'completed' || item.status === 'cancelled').slice(0, 40);

    for (const candidate of candidates) {
      if (!candidate.autoQueueEligible) continue;
      if (activeByProfile.has(candidate.profileId)) {
        nextItems.push(activeByProfile.get(candidate.profileId)!);
        continue;
      }
      nextItems.push({
        id: `warmup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        tenantId,
        profileId: candidate.profileId,
        profileName: candidate.profileName,
        mode: candidate.mode,
        status: settings.approvalsRequired ? 'pending_approval' : 'queued',
        riskBand: candidate.riskBand,
        nextWindow: candidate.nextWindow,
        estimatedDurationMinutes: candidate.estimatedDurationMinutes,
        readinessAfterWarmup: candidate.readinessAfterWarmup,
        createdAt: new Date().toISOString(),
        approvedAt: settings.approvalsRequired ? null : new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        actorUserId,
        approvalUserId: settings.approvalsRequired ? null : actorUserId,
        feedback: {
          outcome: 'unknown',
          notes: null,
          deltaScore: 0,
          recordedAt: null,
        },
      } satisfies PredictiveWarmupQueueEntry);
    }

    const trimmed = nextItems
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 60);
    await this.writeQueue(tenantId, trimmed);

    await Promise.resolve(NotificationCenterService.push(tenantId, {
      kind: 'profile',
      title: 'Nightly warmup queue refreshed',
      body: `${trimmed.filter((item) => item.status === 'pending_approval' || item.status === 'queued').length} profile(s) are queued for the next safe warmup window.`,
      severity: 'info',
    })).catch(() => undefined);

    if (actorUserId) {
      await logAudit({
        tenantId,
        userId: actorUserId,
        action: 'predictive_warmup.queue.rebuilt',
        resource: 'predictive_warmup:queue',
        detail: {
          total: trimmed.length,
          pendingApproval: trimmed.filter((item) => item.status === 'pending_approval').length,
          queued: trimmed.filter((item) => item.status === 'queued').length,
        },
      });
    }

    return {
      settings,
      items: trimmed,
      summary: summarizeItems(trimmed),
    };
  }

  static async listQueue(tenantId: string) {
    const [items, settings] = await Promise.all([
      this.readQueue(tenantId),
      this.getSettings(tenantId),
    ]);
    return {
      settings,
      items,
      summary: summarizeItems(items),
      learning: await WarmupLearningService.summarizeTenant(tenantId),
    };
  }

  static async approveEntry(tenantId: string, entryId: string, actorUserId: string) {
    return this.mutateEntry(tenantId, entryId, async (entry) => ({
      ...entry,
      status: entry.status === 'pending_approval' ? 'queued' : entry.status,
      approvedAt: entry.status === 'pending_approval' ? new Date().toISOString() : entry.approvedAt,
      approvalUserId: actorUserId,
    }), actorUserId, 'predictive_warmup.entry.approved');
  }

  static async cancelEntry(tenantId: string, entryId: string, actorUserId: string) {
    return this.mutateEntry(tenantId, entryId, async (entry) => ({
      ...entry,
      status: 'cancelled',
      completedAt: entry.completedAt || new Date().toISOString(),
    }), actorUserId, 'predictive_warmup.entry.cancelled');
  }

  static async recordFeedback(
    tenantId: string,
    entryId: string,
    actorUserId: string,
    feedback: { outcome: 'improved' | 'unchanged' | 'worsened'; notes?: string; deltaScore?: number }
  ) {
    return this.mutateEntry(tenantId, entryId, async (entry) => ({
      ...entry,
      status: entry.status === 'cancelled' ? 'cancelled' : 'completed',
      completedAt: entry.completedAt || new Date().toISOString(),
      feedback: {
        outcome: feedback.outcome,
        notes: feedback.notes || null,
        deltaScore: feedback.deltaScore || 0,
        recordedAt: new Date().toISOString(),
      },
    }), actorUserId, 'predictive_warmup.feedback.recorded');
  }

  static async processDueEntries(tenantId: string) {
    const [items, settings] = await Promise.all([this.readQueue(tenantId), this.getSettings(tenantId)]);
    const currentHour = new Date().getHours();
    const inWindow = isHourInWindow(currentHour, settings.nightlyWindowStartHour, settings.nightlyWindowEndHour);
    if (!inWindow) {
      return { processed: 0, queued: items.filter((item) => item.status === 'queued').length };
    }

    let processed = 0;
    const nextItems = items.map((item) => {
      if (processed >= 3) return item;
      if (item.status !== 'queued') return item;
      processed += 1;
      return {
        ...item,
        status: 'completed' as const,
        startedAt: item.startedAt || new Date().toISOString(),
        completedAt: new Date().toISOString(),
        feedback: {
          outcome: 'unknown' as const,
          notes: 'Completed scheduled internal warmup orchestration window.',
          deltaScore: 0,
          recordedAt: new Date().toISOString(),
        },
      };
    });

    if (processed > 0) {
      await this.writeQueue(tenantId, nextItems);
      await Promise.resolve(NotificationCenterService.push(tenantId, {
        kind: 'profile',
        title: 'Nightly warmup window processed',
        body: `${processed} profile warmup item(s) were completed in the current safe window.`,
        severity: 'info',
      })).catch(() => undefined);
    }

    return {
      processed,
      queued: nextItems.filter((item) => item.status === 'queued').length,
    };
  }

  private static async mutateEntry(
    tenantId: string,
    entryId: string,
    mutate: (entry: PredictiveWarmupQueueEntry) => Promise<PredictiveWarmupQueueEntry> | PredictiveWarmupQueueEntry,
    actorUserId: string,
    action: string
  ) {
    const items = await this.readQueue(tenantId);
    let found = false;
    const nextItems = await Promise.all(items.map(async (entry) => {
      if (entry.id !== entryId) return entry;
      found = true;
      return mutate(entry);
    }));
    if (!found) {
      throw new Error(`Warmup queue entry ${entryId} not found`);
    }
    await this.writeQueue(tenantId, nextItems);
    const updated = nextItems.find((entry) => entry.id === entryId)!;
    await logAudit({
      tenantId,
      userId: actorUserId,
      action,
      resource: `predictive_warmup:${updated.profileId}`,
      detail: updated,
    });
    return updated;
  }

  private static async readQueue(tenantId: string): Promise<PredictiveWarmupQueueEntry[]> {
    try {
      return await fs.readJson(this.queuePath(tenantId));
    } catch {
      return [];
    }
  }

  private static async writeQueue(tenantId: string, items: PredictiveWarmupQueueEntry[]) {
    await fs.ensureDir(path.dirname(this.queuePath(tenantId)));
    await fs.writeJson(this.queuePath(tenantId), items, { spaces: 2 });
  }

  private static queuePath(tenantId: string) {
    return path.resolve(config.profileStateDir, 'warmup-queues', `${tenantId}.json`);
  }

  private static settingsPath(tenantId: string) {
    return path.resolve(config.profileStateDir, 'warmup-settings', `${tenantId}.json`);
  }
}

function summarizeItems(items: PredictiveWarmupQueueEntry[]) {
  return {
    total: items.length,
    pendingApproval: items.filter((item) => item.status === 'pending_approval').length,
    queued: items.filter((item) => item.status === 'queued').length,
    running: items.filter((item) => item.status === 'running').length,
    completed: items.filter((item) => item.status === 'completed').length,
    fragile: items.filter((item) => item.riskBand === 'high' || item.riskBand === 'medium').length,
  };
}

function clampHour(value: number) {
  return Math.max(0, Math.min(23, Math.floor(value)));
}

function isHourInWindow(currentHour: number, startHour: number, endHour: number) {
  if (startHour === endHour) return true;
  if (startHour < endHour) return currentHour >= startHour && currentHour < endHour;
  return currentHour >= startHour || currentHour < endHour;
}
