import { describe, expect, it } from 'vitest';
import { PlatformBenchmarkService } from '../src/services/platformBenchmark.service';

describe('PlatformBenchmarkService', () => {
  it('summarizes flows by stability and sorts weakest first', () => {
    const rows = PlatformBenchmarkService.summarizeRuns([
      {
        id: 'run-1',
        flowId: 'flow-a',
        status: 'completed',
        duration: 4000,
        analysis: { errorClass: 'none' },
        flow: { name: 'Stable Flow' },
      },
      {
        id: 'run-2',
        flowId: 'flow-a',
        status: 'completed',
        duration: 5000,
        analysis: { errorClass: 'none' },
        flow: { name: 'Stable Flow' },
      },
      {
        id: 'run-3',
        flowId: 'flow-b',
        status: 'failed',
        duration: 18000,
        analysis: { errorClass: 'stalled_transition' },
        flow: { name: 'Fragile Flow' },
      },
      {
        id: 'run-4',
        flowId: 'flow-b',
        status: 'failed',
        duration: 15000,
        analysis: { errorClass: 'selector_timeout' },
        flow: { name: 'Fragile Flow' },
      },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0].flowId).toBe('flow-b');
    expect(rows[0].runs).toBe(2);
    expect(rows[0].successRate).toBe(0);
    expect(rows[0].stabilityScore).toBeLessThan(rows[1].stabilityScore);
    expect(rows[1].flowName).toBe('Stable Flow');
  });
});
