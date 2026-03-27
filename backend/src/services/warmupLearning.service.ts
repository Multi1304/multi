import fs from 'fs-extra';
import path from 'path';
import { config } from '../config';

export interface WarmupLearningSummary {
  completed: number;
  improved: number;
  worsened: number;
  averageDelta: number;
  recommendedMode: 'balanced' | 'light' | 'moderate';
  lastOutcome: 'unknown' | 'improved' | 'unchanged' | 'worsened';
  lastMode: string | null;
}

export class WarmupLearningService {
  static async summarizeTenant(tenantId: string): Promise<WarmupLearningSummary> {
    const items = await this.readQueue(tenantId);
    return summarizeLearning(items);
  }

  static async summarizeProfile(tenantId: string, profileId: string): Promise<WarmupLearningSummary> {
    const items = await this.readQueue(tenantId);
    return summarizeLearning(items.filter((item: any) => item.profileId === profileId));
  }

  private static async readQueue(tenantId: string): Promise<any[]> {
    try {
      return await fs.readJson(path.resolve(config.profileStateDir, 'warmup-queues', `${tenantId}.json`));
    } catch {
      return [];
    }
  }
}

function summarizeLearning(items: any[]): WarmupLearningSummary {
  const completed = items.filter((item) => item.status === 'completed' && item.feedback?.recordedAt);
  const improved = completed.filter((item) => item.feedback?.outcome === 'improved').length;
  const worsened = completed.filter((item) => item.feedback?.outcome === 'worsened').length;
  const averageDelta = completed.length
    ? Math.round(completed.reduce((sum, item) => sum + (item.feedback?.deltaScore || 0), 0) / completed.length)
    : 0;
  const lastCompleted = completed.slice().sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1))[0] || null;

  return {
    completed: completed.length,
    improved,
    worsened,
    averageDelta,
    recommendedMode: improved > worsened ? 'moderate' : worsened > improved ? 'light' : 'balanced',
    lastOutcome: lastCompleted?.feedback?.outcome || 'unknown',
    lastMode: lastCompleted?.mode || null,
  };
}
