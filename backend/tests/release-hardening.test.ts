import { describe, expect, it } from 'vitest';
import { RuntimeHardeningService } from '../src/services/runtimeHardening.service';
import { ReleaseGateService } from '../src/services/releaseGate.service';

describe('runtime hardening', () => {
  it('builds a deterministic hardening snapshot', () => {
    const snapshot = RuntimeHardeningService.buildSnapshot([
      {
        id: 'preset-1',
        name: 'Preset 1',
        platform: 'OTHER',
        browser: 'CHROME',
        config: {
          userAgent: 'Mozilla/5.0 (Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          screenResolution: '1920x1080',
          language: 'en-US',
          platformOS: 'Windows',
          hardwareConcurrency: 8,
          deviceMemory: 16,
          timezoneId: 'Europe/Madrid',
          presetVersion: 'corpus-v2',
          validation: { score: 92, issues: [] },
        },
      },
    ], [
      {
        id: 'profile-1',
        name: 'Profile 1',
        platform: 'DESKTOP',
        proxyConfig: { host: '127.0.0.1' },
        fingerprintPresetId: 'preset-1',
        fingerprint: { validation: { score: 90 }, presetVersion: 'corpus-v2' },
      },
    ]);

    expect(snapshot.overallScore).toBeGreaterThan(0);
    expect(snapshot.items.length).toBeGreaterThanOrEqual(5);
    expect(snapshot.fingerprint.averageScore).toBe(92);
  });
});

describe('release gates', () => {
  it('classifies score thresholds consistently', () => {
    const statusFor = (ReleaseGateService as any).statusFor.bind(ReleaseGateService);
    expect(statusFor(90, 80)).toBe('pass');
    expect(statusFor(72, 80)).toBe('warning');
    expect(statusFor(40, 80)).toBe('fail');
  });
});
