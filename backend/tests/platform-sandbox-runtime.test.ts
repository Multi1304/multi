import { afterEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    tenant: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../src/prisma', () => ({
  prisma: prismaMock,
}));

import { PlatformCompatibilityService } from '../src/services/platformCompatibility.service';
import { SandboxRuntimeEmulationService } from '../src/services/sandboxRuntimeEmulation.service';

describe('PlatformCompatibilityService', () => {
  it('returns a scored compatibility result', () => {
    const result = PlatformCompatibilityService.evaluate({
      arch: 'arm64',
      platformOS: 'macOS',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.status).toMatch(/strong|warning|critical/);
    expect(result.host.arch).toBeTruthy();
  });
});

describe('SandboxRuntimeEmulationService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes and persists sandbox runtime settings', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({ settings: {} });
    prismaMock.tenant.update.mockResolvedValue({});

    const saved = await SandboxRuntimeEmulationService.updateSettings('tenant-1', {
      enabled: true,
      allowedHosts: ['localhost', 'demo.local'],
      intervalMinMinutes: 4,
      intervalMaxMinutes: 9,
    });

    expect(saved.allowedHosts).toContain('demo.local');
    expect(saved.intervalMinMinutes).toBe(4);
    expect(prismaMock.tenant.update).toHaveBeenCalled();
  });
});
