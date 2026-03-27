import { describe, expect, it } from 'vitest';
import { normalizeAuditRecord, summarizeAuditActions } from '../src/services/audit.service';
import { FingerprintValidationService } from '../src/services/fingerprintValidation.service';

describe('enterprise observability services', () => {
  it('normalizes audit records into viewer-friendly fields', () => {
    const normalized = normalizeAuditRecord({
      id: 'audit-1',
      action: 'profile.share',
      resource: 'profile:abc123',
      detail: { targetUserId: 'user-2', permission: 'WRITE' },
      ip: '127.0.0.1',
    });

    expect(normalized.resourceType).toBe('profile');
    expect(normalized.resourceId).toBe('abc123');
    expect(normalized.metadata.permission).toBe('WRITE');
    expect(normalized.ipAddress).toBe('127.0.0.1');
  });

  it('summarizes audit actions and fingerprint matrix health', () => {
    const summary = summarizeAuditActions([
      { action: 'profile.share' },
      { action: 'profile.share' },
      { action: 'flow.share' },
    ]);

    expect(summary[0]).toEqual({ action: 'profile.share', count: 2 });

    const matrix = FingerprintValidationService.buildMatrix([
      {
        id: 'preset-1',
        name: 'Preset A',
        platform: 'OTHER',
        browser: 'CHROME',
        config: {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          screenResolution: '1920x1080',
          language: 'en-US',
          platformOS: 'Windows',
          deviceScaleFactor: 1,
          timezoneId: 'Europe/Madrid',
          isMobile: false,
          presetVersion: 'test-v1',
          validation: { score: 92, issues: [] }
        }
      },
      {
        id: 'preset-2',
        name: 'Preset B',
        platform: 'OTHER',
        browser: 'CHROME',
        config: {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
          screenResolution: '390x844',
          language: 'es-ES',
          platformOS: 'Windows',
          deviceScaleFactor: 3,
          timezoneId: 'America/New_York',
          isMobile: false,
          presetVersion: 'test-v1'
        }
      }
    ], [
      { fingerprintPresetId: 'preset-2' },
      { fingerprintPresetId: 'preset-2' }
    ]);

    expect(matrix[0].id).toBe('preset-2');
    expect(matrix[0].severity).toBe('critical');
    expect(matrix[0].profileCount).toBe(2);

    const matrixSummary = FingerprintValidationService.summarizeMatrix(matrix);
    expect(matrixSummary.total).toBe(2);
    expect(matrixSummary.critical).toBe(1);
  });
});
