import { describe, expect, it } from 'vitest';
import { TenantCapacityService } from '../src/services/tenantCapacity.service';

describe('TenantCapacityService', () => {
  it('normalizes runtime capacity settings with defaults', () => {
    const settings = TenantCapacityService.normalizeSettings({});
    expect(settings.maxConcurrentProfiles).toBe(-1);
    expect(settings.rateLimitPerSeatPerMinute).toBe(120);
    expect(settings.licenseEnforced).toBe(false);
    expect(settings.licenseActive).toBe(true);
  });

  it('detects invalid enforced licenses', () => {
    expect(TenantCapacityService.isLicenseCurrentlyValid({
      maxConcurrentProfiles: 5,
      rateLimitPerSeatPerMinute: 60,
      licenseKey: null,
      licenseEnforced: true,
      licenseActive: true,
      licenseExpiresAt: null,
    })).toBe(false);

    expect(TenantCapacityService.isLicenseCurrentlyValid({
      maxConcurrentProfiles: 5,
      rateLimitPerSeatPerMinute: 60,
      licenseKey: 'abc',
      licenseEnforced: true,
      licenseActive: false,
      licenseExpiresAt: null,
    })).toBe(false);
  });
});
