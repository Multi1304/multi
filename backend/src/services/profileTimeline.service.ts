import { prisma } from '../prisma';
import { ProfileStateService } from './profileState.service';
import { BulkProfileOperationService } from './bulkProfileOperation.service';

export interface ProfileTimelineEvent {
  id: string;
  at: string;
  type: 'state' | 'snapshot' | 'sync' | 'operation' | 'account';
  title: string;
  detail: string;
  severity: 'info' | 'warning' | 'critical';
}

export class ProfileTimelineService {
  static async getTimeline(profileId: string, tenantId: string) {
    const [state, operations, accountRows] = await Promise.all([
      ProfileStateService.getStateSummary(profileId, tenantId),
      BulkProfileOperationService.listByProfile(tenantId, profileId, 25),
      (prisma.account as any).findMany({
        where: { tenantId, profileId },
        orderBy: { updatedAt: 'desc' },
        take: 12,
        select: {
          id: true,
          username: true,
          verified: true,
          used: true,
          inboxStatus: true,
          updatedAt: true,
        },
      }).catch(() => []),
    ]);

    const activity = (state.activity || []).map((entry) => ({
      id: entry.id,
      at: entry.at,
      type: classifyActivity(entry.action),
      title: entry.action,
      detail: JSON.stringify(entry.details || {}),
      severity: classifySeverity(entry.action),
    })) as ProfileTimelineEvent[];

    const operationEvents = (operations || []).map((operation: any) => ({
      id: `operation:${operation.id}`,
      at: operation.updatedAt || operation.createdAt,
      type: 'operation' as const,
      title: `${operation.request?.operation || operation.type} ${operation.status}`,
      detail: `${operation.completed}/${operation.totalTasks} completed, ${operation.failed || 0} failed`,
      severity: operation.failed > 0 ? 'warning' : operation.status === 'completed' ? 'info' : 'critical',
    }));

    const accountEvents = (accountRows || []).map((account: any) => ({
      id: `account:${account.id}`,
      at: account.updatedAt,
      type: 'account' as const,
      title: `${account.username} state`,
      detail: `verified=${account.verified} used=${account.used} inbox=${account.inboxStatus}`,
      severity: account.inboxStatus === 'blocked' ? 'critical' : account.verified ? 'info' : 'warning',
    }));

    const items = [...activity, ...operationEvents, ...accountEvents]
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, 60);

    return {
      profileId,
      items,
      heatmap: buildHeatmap(items),
    };
  }
}

function classifyActivity(action: string): ProfileTimelineEvent['type'] {
  if (action.includes('snapshot')) return 'snapshot';
  if (action.includes('sync') || action.includes('manifest')) return 'sync';
  return 'state';
}

function classifySeverity(action: string): ProfileTimelineEvent['severity'] {
  if (action.includes('takeover') || action.includes('release')) return 'warning';
  if (action.includes('failed') || action.includes('quarantine')) return 'critical';
  return 'info';
}

function buildHeatmap(items: ProfileTimelineEvent[]) {
  const buckets = new Map<string, number>();
  for (const item of items) {
    const date = new Date(item.at);
    const key = `${date.getDay()}-${date.getHours()}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  return Array.from(buckets.entries()).map(([slot, count]) => {
    const [day, hour] = slot.split('-').map(Number);
    return { day, hour, count };
  });
}
