import { describe, expect, it } from 'vitest';
import { BulkProfileOperationService } from '../src/services/bulkProfileOperation.service';

describe('BulkProfileOperationService', () => {
  it('normalizes bulk operation payloads with retryable failures', () => {
    const normalized = BulkProfileOperationService.normalize({
      id: 'op-1',
      type: 'profiles_state',
      status: 'completed_with_errors',
      totalTasks: 3,
      completed: 2,
      failed: 1,
      createdAt: new Date('2026-03-18T10:00:00.000Z'),
      updatedAt: new Date('2026-03-18T10:01:00.000Z'),
      errors: {
        request: {
          kind: 'profile_state',
          operation: 'sync',
          profileIds: ['p1', 'p2', 'p3'],
        },
        retriableProfileIds: ['p3'],
        summary: {
          total: 3,
          completed: 2,
          failed: 1,
          successRate: 67,
        },
        results: [
          { profileId: 'p1', ok: true },
          { profileId: 'p2', ok: true },
          { profileId: 'p3', ok: false, error: 'Profile p3 is busy for sync' },
        ],
      },
    });

    expect(normalized.id).toBe('op-1');
    expect(normalized.request?.operation).toBe('sync');
    expect(normalized.summary?.successRate).toBe(67);
    expect(normalized.retriableProfileIds).toEqual(['p3']);
    expect(normalized.failedResults).toHaveLength(1);
    expect(normalized.failedResults[0].profileId).toBe('p3');
  });

  it('summarizes operational conflicts for a single profile', () => {
    const operations: any[] = [
      {
        id: 'op-processing',
        status: 'processing',
        retriableProfileIds: [],
        failedResults: [],
        request: { profileIds: ['p1'], operation: 'sync' },
      },
      {
        id: 'op-failed',
        status: 'completed_with_errors',
        retriableProfileIds: ['p1'],
        failedResults: [{ profileId: 'p1', error: 'Profile p1 is busy for sync' }],
        request: { profileIds: ['p1'], operation: 'sync' },
      },
    ];

    const summary = BulkProfileOperationService.summarizeForProfile('p1', operations as any);

    expect(summary.activeOperations).toBe(1);
    expect(summary.retryableOperations).toBe(1);
    expect(summary.conflictCount).toBe(1);
    expect(summary.hasBlockingConflict).toBe(true);
    expect(summary.lastFailure?.id).toBe('op-failed');
  });
});
