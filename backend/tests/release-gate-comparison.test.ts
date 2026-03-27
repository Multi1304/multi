import { describe, expect, it } from 'vitest';
import { ReleaseGateService, type ReleaseGateSnapshot } from '../src/services/releaseGate.service';

describe('release gate comparison', () => {
  it('computes deltas and trend correctly', () => {
    const previous: ReleaseGateSnapshot = {
      id: 'prev',
      tenantId: 'tenant',
      createdAt: new Date().toISOString(),
      overallScore: 70,
      status: 'warning',
      items: [
        { id: 'flow_stability', label: 'Flow Stability', score: 60, threshold: 60, status: 'pass', detail: '' },
        { id: 'runtime_hardening', label: 'Runtime Hardening', score: 80, threshold: 80, status: 'pass', detail: '' },
      ],
      metadata: {
        releaseLabel: '1.0.0',
        commitRef: 'abc',
        dominantPresetVersion: 'corpus-v2',
        comparedTo: null,
      },
    };
    const current: ReleaseGateSnapshot = {
      ...previous,
      id: 'cur',
      overallScore: 78,
      items: [
        { id: 'flow_stability', label: 'Flow Stability', score: 72, threshold: 60, status: 'pass', detail: '' },
        { id: 'runtime_hardening', label: 'Runtime Hardening', score: 84, threshold: 80, status: 'pass', detail: '' },
      ],
      metadata: {
        releaseLabel: '1.0.1',
        commitRef: 'def',
        dominantPresetVersion: 'corpus-v2',
        comparedTo: 'prev',
      },
    };

    const comparison = ReleaseGateService.compareSnapshots(current, previous);
    expect(comparison.deltaOverallScore).toBe(8);
    expect(comparison.trend).toBe('improved');
    expect(comparison.itemDeltas[0].delta).toBe(12);
  });
});
