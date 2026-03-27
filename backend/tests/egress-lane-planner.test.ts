import { afterEach, describe, expect, it, vi } from 'vitest';

const { getReportMock, getSnapshotMock, getPlanMock } = vi.hoisted(() => ({
  getReportMock: vi.fn(),
  getSnapshotMock: vi.fn(),
  getPlanMock: vi.fn(),
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

vi.mock('../src/services/networkStrategyWizard.service', () => ({
  NetworkStrategyWizardService: {
    getPlan: getPlanMock,
  },
}));

import { EgressLanePlannerService } from '../src/services/egressLanePlanner.service';

describe('EgressLanePlannerService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('creates proxyless, self-hosted and commercial lanes with overflow reserved for paid pool', async () => {
    getReportMock.mockResolvedValue({
      currentCapacity: {
        proxyless: { recommendedProfiles: 10, percentOfConcurrency: 42 },
        selfHostedVpn: { recommendedProfiles: 8, percentOfConcurrency: 33 },
        commercialPool: { recommendedProfiles: 6, percentOfConcurrency: 25 },
      },
      strongSeparation: { note: 'Breaks above 7 concurrent profiles.', currentCapacity: 7 },
    });
    getSnapshotMock.mockResolvedValue({
      vpnCluster: {
        clusters: [
          { clusterId: 'wg-a', exits: 2, healthy: 2, countries: ['es'], cities: ['madrid'] },
          { clusterId: 'wg-b', exits: 1, healthy: 1, countries: ['pt'], cities: ['lisbon'] },
        ],
      },
    });
    getPlanMock.mockResolvedValue({ scaleBand: 'medium' });

    const result = await EgressLanePlannerService.getPlan('tenant-1');

    expect(result.defaultMode).toBe('hybrid');
    expect(result.lanes.proxyless.targetProfiles).toBe(10);
    expect(result.lanes.selfHostedVpn).toHaveLength(2);
    expect(result.lanes.commercialOverflow.targetProfiles).toBe(6);
    expect(result.commercialMinimizationActions.some((item: string) => item.includes('self-hosted'))).toBe(true);
  });
});
