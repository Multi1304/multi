import { afterEach, describe, expect, it, vi } from 'vitest';

const { getReportMock, getSnapshotMock, resolveLaneMock } = vi.hoisted(() => ({
  getReportMock: vi.fn(),
  getSnapshotMock: vi.fn(),
  resolveLaneMock: vi.fn(),
}));

vi.mock('../src/services/egressDependencyReport.service', () => ({
  EgressDependencyReportService: {
    getReport: getReportMock,
  },
}));

vi.mock('../src/services/networkObservability.service', () => ({
  NetworkObservabilityService: {
    getSnapshot: getSnapshotMock,
  },
}));

vi.mock('../src/services/egressLanePolicy.service', () => ({
  EgressLanePolicyService: {
    resolveLaneForProfile: resolveLaneMock,
  },
}));

import { EgressAdmissionService } from '../src/services/egressAdmission.service';

describe('EgressAdmissionService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('prefers queue for sensitive profiles when commercial spill would happen too early', async () => {
    getReportMock.mockResolvedValue({
      currentCapacity: {
        commercialPool: { percentOfConcurrency: 40 },
      },
    });
    getSnapshotMock.mockResolvedValue({ vpnCluster: { healthyExitCount: 0 } });
    resolveLaneMock.mockResolvedValue({ laneId: 'commercial_overflow' });

    const result = await EgressAdmissionService.evaluate('tenant-1', {
      id: 'p1',
      platform: 'MOBILE',
      geolocation: { country: 'es' },
    });

    expect(result.shouldQueue).toBe(true);
    expect(result.reason).toContain('queue');
  });
});
