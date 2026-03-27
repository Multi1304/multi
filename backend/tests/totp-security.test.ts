import { describe, expect, it } from 'vitest';
import { TotpService } from '../src/services/totp.service';

describe('TotpService', () => {
  it('creates a setup payload and verifies current codes', () => {
    const setup = TotpService.createSetup('admin@example.com', 'Camel');
    expect(setup.secret).toHaveLength(32);
    expect(setup.otpauthUri).toContain('otpauth://totp/');

    const timestamp = 1_710_000_000_000;
    const code = TotpService.generateForTimestamp(setup.encryptedSecret, timestamp);
    expect(code).toMatch(/^\d{6}$/);
    expect(TotpService.verify(setup.encryptedSecret, code, timestamp)).toBe(true);
    expect(TotpService.verify(setup.encryptedSecret, '000000', timestamp)).toBe(false);
  });
});
