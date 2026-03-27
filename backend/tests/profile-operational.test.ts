import { describe, expect, it } from 'vitest';
import { ProfileOperationalService } from '../src/services/profileOperational.service';

describe('ProfileOperationalService', () => {
  it('summarizes profile operational health and weakest profiles', () => {
    const summary = ProfileOperationalService.summarize([
      {
        id: 'p1',
        name: 'Healthy Profile',
        platform: 'DESKTOP',
        proxyConfig: { host: '1.2.3.4' },
        fingerprint: { presetVersion: 'corpus-v2', validation: { score: 92 } }
      },
      {
        id: 'p2',
        name: 'Warning Profile',
        platform: 'MOBILE',
        proxyConfig: null,
        fingerprint: { presetVersion: 'corpus-v2', validation: { score: 70 } }
      },
      {
        id: 'p3',
        name: 'Critical Profile',
        platform: 'DESKTOP',
        proxyConfig: null,
        fingerprint: { presetVersion: 'legacy', validation: { score: 40 } }
      }
    ]);

    expect(summary.total).toBe(3);
    expect(summary.healthy).toBe(1);
    expect(summary.warning).toBe(1);
    expect(summary.critical).toBe(1);
    expect(summary.withProxy).toBe(1);
    expect(summary.weakest[0].id).toBe('p3');
  });
});
