import { prisma } from '../prisma';

export interface BulkProfileRequest {
  kind: 'profile_state' | 'profile_access';
  operation: 'snapshot' | 'sync' | 'pull' | 'grant' | 'revoke';
  profileIds: string[];
  targetUserId?: string | null;
  permission?: string | null;
}

export interface BulkProfileResult {
  profileId: string;
  ok: boolean;
  error?: string;
  manifest?: any;
}

export class BulkProfileOperationService {
  static async create(tenantId: string, type: string, request: BulkProfileRequest) {
    return await (prisma.bulkOperation as any).create({
      data: {
        tenantId,
        type,
        status: 'processing',
        totalTasks: request.profileIds.length,
        errors: {
          request,
          results: [],
          retriableProfileIds: [],
          summary: null,
        },
      },
    });
  }

  static async complete(operationId: string, results: BulkProfileResult[]) {
    const completed = results.filter((item) => item.ok).length;
    const failed = results.length - completed;
    const retriableProfileIds = results
      .filter((item) => !item.ok)
      .map((item) => item.profileId);
    const summary = {
      total: results.length,
      completed,
      failed,
      successRate: results.length ? Math.round((completed / results.length) * 100) : 0,
    };

    return await (prisma.bulkOperation as any).update({
      where: { id: operationId },
      data: {
        status: failed > 0 ? (completed > 0 ? 'completed_with_errors' : 'failed') : 'completed',
        completed,
        failed,
        errors: {
          ...(await this.readPayload(operationId)),
          results,
          retriableProfileIds,
          summary,
        },
      },
    });
  }

  static async fail(operationId: string, error: string) {
    return await (prisma.bulkOperation as any).update({
      where: { id: operationId },
      data: {
        status: 'failed',
        failed: 1,
        errors: {
          ...(await this.readPayload(operationId)),
          fatalError: error,
        },
      },
    });
  }

  static async listRecent(tenantId: string, typePrefix = 'profiles', limit = 12) {
    const rows = await (prisma.bulkOperation as any).findMany({
      where: {
        tenantId,
        type: {
          startsWith: typePrefix,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return rows.map((row: any) => this.normalize(row));
  }

  static async getById(tenantId: string, operationId: string) {
    const row = await (prisma.bulkOperation as any).findFirst({
      where: {
        tenantId,
        id: operationId,
      },
    });

    return row ? this.normalize(row) : null;
  }

  static async listByProfile(tenantId: string, profileId: string, limit = 10) {
    const rows = await (prisma.bulkOperation as any).findMany({
      where: {
        tenantId,
        type: {
          startsWith: 'profiles',
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.max(limit * 4, 20),
    });

    return rows
      .map((row: any) => this.normalize(row))
      .filter((row: any) => row.request?.profileIds?.includes(profileId))
      .slice(0, limit);
  }

  static summarizeForProfile(profileId: string, operations: ReturnType<typeof BulkProfileOperationService.normalize>[]) {
    const processing = operations.filter((operation: any) => operation.status === 'processing');
    const failed = operations.filter((operation: any) =>
      (operation.failed || 0) > 0 ||
      operation.status === 'failed' ||
      operation.status === 'completed_with_errors' ||
      (operation.failedResults?.length || 0) > 0
    );
    const retryable = operations.filter((operation: any) => operation.retriableProfileIds?.includes(profileId));
    const conflictErrors = failed
      .flatMap((operation: any) => operation.failedResults || [])
      .filter((result: any) => result.profileId === profileId && /busy|lock|leased/i.test(result.error || ''));

    return {
      activeOperations: processing.length,
      retryableOperations: retryable.length,
      conflictCount: conflictErrors.length,
      hasBlockingConflict: conflictErrors.length > 0 || processing.length > 0,
      lastFailure: failed.find((operation: any) =>
        (operation.failedResults || []).some((result: any) => result.profileId === profileId)
      ) || null,
    };
  }

  static normalize(row: any) {
    const payload = row?.errors && typeof row.errors === 'object' ? row.errors : {};
    const request = payload.request || null;
    const results = Array.isArray(payload.results) ? payload.results : [];
    const failedResults = results.filter((item: any) => !item.ok);

    return {
      id: row.id,
      type: row.type,
      status: row.status,
      totalTasks: row.totalTasks,
      completed: row.completed,
      failed: row.failed,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      request,
      summary: payload.summary || {
        total: row.totalTasks,
        completed: row.completed,
        failed: row.failed,
        successRate: row.totalTasks ? Math.round((row.completed / row.totalTasks) * 100) : 0,
      },
      fatalError: payload.fatalError || null,
      retriableProfileIds: Array.isArray(payload.retriableProfileIds) ? payload.retriableProfileIds : [],
      failedResults: failedResults.slice(0, 8),
    };
  }

  private static async readPayload(operationId: string) {
    const existing = await (prisma.bulkOperation as any).findUnique({
      where: { id: operationId },
      select: { errors: true },
    });
    return existing?.errors && typeof existing.errors === 'object' ? existing.errors : {};
  }
}
