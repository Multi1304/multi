import { describe, expect, it } from 'vitest';
import { FlowOperationalService } from '../src/services/flowOperational.service';

describe('FlowOperationalService', () => {
  it('summarizes flow runs by status and error class', () => {
    const summary = FlowOperationalService.summarize([
      { id: 'run-1', status: 'running', analysis: { errorClass: 'none' }, createdAt: new Date('2026-03-18T10:00:00.000Z') },
      { id: 'run-2', status: 'failed', analysis: { errorClass: 'stage_desync' }, createdAt: new Date('2026-03-18T09:00:00.000Z') },
      { id: 'run-3', status: 'completed', analysis: { errorClass: 'none' }, createdAt: new Date('2026-03-18T08:00:00.000Z') },
    ]);

    expect(summary.totalRuns).toBe(3);
    expect(summary.running).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.completed).toBe(1);
    expect(summary.retryable).toBe(1);
    expect(summary.errorClasses.stage_desync).toBe(1);
  });
});
