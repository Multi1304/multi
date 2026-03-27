import crypto from 'crypto';
import { prisma } from '../prisma';
import { redis } from '../utils/redis';
import { config } from '../config';
import { logAudit } from './audit.service';
import { AccessService } from './access.service';

type DestructiveActionType =
  | 'flow.delete'
  | 'api_key.delete'
  | 'profile.access.revoke'
  | 'flow.access.revoke';

type DestructiveTask = {
  id: string;
  tenantId: string;
  userId: string;
  action: DestructiveActionType;
  resource: string;
  status: 'pending' | 'cancelled' | 'executed' | 'failed';
  executeAt: string;
  createdAt: string;
  executedAt?: string | null;
  payload: Record<string, any>;
  note?: string | null;
};

function taskKey(id: string) {
  return `camel:destructive:task:${id}`;
}

function tenantIndexKey(tenantId: string) {
  return `camel:destructive:tenant:${tenantId}`;
}

const dueKey = 'camel:destructive:due';

function serialize(task: DestructiveTask) {
  return JSON.stringify(task);
}

function deserialize(raw: string | null): DestructiveTask | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export class DestructiveActionService {
  static isEnabled() {
    return config.destructiveActions.enabled;
  }

  static async schedule(args: {
    tenantId: string;
    userId: string;
    action: DestructiveActionType;
    resource: string;
    payload: Record<string, any>;
    delaySeconds?: number;
    note?: string;
  }) {
    const delaySeconds = args.delaySeconds ?? config.destructiveActions.defaultDelaySeconds;
    const id = crypto.randomUUID();
    const executeAt = new Date(Date.now() + delaySeconds * 1000);
    const task: DestructiveTask = {
      id,
      tenantId: args.tenantId,
      userId: args.userId,
      action: args.action,
      resource: args.resource,
      status: 'pending',
      createdAt: new Date().toISOString(),
      executeAt: executeAt.toISOString(),
      payload: args.payload,
      note: args.note || null,
    };

    await redis.set(taskKey(id), serialize(task));
    await redis.zadd(dueKey, executeAt.getTime(), id);
    await redis.sadd(tenantIndexKey(args.tenantId), id);

    await logAudit({
      tenantId: args.tenantId,
      userId: args.userId,
      action: 'destructive_action.scheduled',
      resource: args.resource,
      detail: { taskId: id, action: args.action, executeAt: task.executeAt, delaySeconds, note: args.note || null },
    });

    return task;
  }

  static async list(tenantId: string, limit = 50) {
    const ids = await redis.smembers(tenantIndexKey(tenantId));
    const tasks = (await Promise.all(ids.map(async (id) => deserialize(await redis.get(taskKey(id)))))).filter(Boolean) as DestructiveTask[];
    return tasks
      .sort((a, b) => (a.executeAt < b.executeAt ? -1 : 1))
      .slice(0, limit);
  }

  static async cancel(tenantId: string, taskId: string, userId: string) {
    const task = deserialize(await redis.get(taskKey(taskId)));
    if (!task || task.tenantId !== tenantId) {
      throw new Error('Destructive action not found');
    }
    if (task.status !== 'pending') {
      throw new Error('Only pending actions can be cancelled');
    }

    task.status = 'cancelled';
    await redis.set(taskKey(taskId), serialize(task));
    await redis.zrem(dueKey, taskId);

    await logAudit({
      tenantId,
      userId,
      action: 'destructive_action.cancelled',
      resource: task.resource,
      detail: { taskId, action: task.action },
    });

    return task;
  }

  static async executeNow(tenantId: string, taskId: string, userId: string) {
    const task = deserialize(await redis.get(taskKey(taskId)));
    if (!task || task.tenantId !== tenantId) {
      throw new Error('Destructive action not found');
    }
    if (task.status !== 'pending') {
      throw new Error('Only pending actions can be executed');
    }
    const result = await this.executeTask(task);
    await logAudit({
      tenantId,
      userId,
      action: 'destructive_action.executed_now',
      resource: task.resource,
      detail: { taskId, action: task.action, resultStatus: result.status },
    });
    return result;
  }

  static async processDue(limit = 25) {
    const dueIds = await redis.zrangebyscore(dueKey, 0, Date.now(), 'LIMIT', 0, limit);
    const results: DestructiveTask[] = [];
    for (const id of dueIds) {
      const task = deserialize(await redis.get(taskKey(id)));
      if (!task || task.status !== 'pending') {
        await redis.zrem(dueKey, id);
        continue;
      }
      results.push(await this.executeTask(task));
    }
    return results;
  }

  private static async executeTask(task: DestructiveTask) {
    try {
      switch (task.action) {
        case 'flow.delete':
          await (prisma as any).flow.delete({ where: { id: task.payload.flowId } });
          break;
        case 'api_key.delete':
          await (prisma as any).apiKey.delete({ where: { id: task.payload.apiKeyId } });
          break;
        case 'profile.access.revoke':
          await AccessService.revokeAccess(task.payload.targetUserId, task.tenantId, 'profile', task.payload.profileId);
          break;
        case 'flow.access.revoke':
          await AccessService.revokeAccess(task.payload.targetUserId, task.tenantId, 'flow', task.payload.flowId);
          break;
        default:
          throw new Error(`Unsupported destructive action ${task.action}`);
      }

      task.status = 'executed';
      task.executedAt = new Date().toISOString();
      await redis.set(taskKey(task.id), serialize(task));
      await redis.zrem(dueKey, task.id);

      await logAudit({
        tenantId: task.tenantId,
        userId: task.userId,
        action: 'destructive_action.executed',
        resource: task.resource,
        detail: { taskId: task.id, action: task.action, payload: task.payload },
      });
    } catch (error: any) {
      task.status = 'failed';
      task.executedAt = new Date().toISOString();
      task.note = error?.message || 'Unknown error';
      await redis.set(taskKey(task.id), serialize(task));
      await redis.zrem(dueKey, task.id);

      await logAudit({
        tenantId: task.tenantId,
        userId: task.userId,
        action: 'destructive_action.failed',
        resource: task.resource,
        detail: { taskId: task.id, action: task.action, error: task.note },
      });
    }

    return task;
  }
}
