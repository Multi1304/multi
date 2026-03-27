import { afterEach, describe, expect, it, vi } from 'vitest';

const { getStatusMock, getAdvisorMock } = vi.hoisted(() => ({
  getStatusMock: vi.fn(),
  getAdvisorMock: vi.fn(),
}));

vi.mock('../src/services/tenantCapacity.service', () => ({
  TenantCapacityService: {
    getStatus: getStatusMock,
  },
}));

vi.mock('../src/services/proxyAdvisor.service', () => ({
  ProxyAdvisorService: {
    getAdvisor: getAdvisorMock,
  },
}));

import { NetworkStrategyWizardService } from '../src/services/networkStrategyWizard.service';

describe('NetworkStrategyWizardService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('recommends hybrid or pool thinking when seat count is high', async () => {
    getStatusMock.mockResolvedValue({
      activeSeatCount: 30,
      effectiveConcurrentProfileLimit: 60,
    });
    getAdvisorMock.mockResolvedValue({ mode: 'limited_pool' });

    const result = await NetworkStrategyWizardService.getPlan('tenant-1');

    expect(result.scaleBand).toBe('high');
    expect(result.recommendation).toContain('20-50 seats');
    expect(result.options.find((item: any) => item.id === 'single_vpn')?.fit).toBe('poor');
  });

  it('keeps proxyless attractive at low scale', async () => {
    getStatusMock.mockResolvedValue({
      activeSeatCount: 2,
      effectiveConcurrentProfileLimit: 4,
    });
    getAdvisorMock.mockResolvedValue({ mode: 'proxyless' });

    const result = await NetworkStrategyWizardService.getPlan('tenant-1');

    expect(result.scaleBand).toBe('low');
    expect(result.options.find((item: any) => item.id === 'proxyless')?.fit).toBe('good');
    expect(result.vpnGuidance.attractive).toBe(true);
  });
});
