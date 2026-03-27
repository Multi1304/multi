import { describe, expect, it } from 'vitest';
import { encryptSecret } from '../src/utils/cryptoVault';
import { AccountStateService } from '../src/services/accountState.service';

describe('AccountStateService', () => {
  it('normalizes legacy account state safely', () => {
    const normalized = AccountStateService.normalizeAccount({
      id: 'acc-1',
      username: 'demo@example.com',
      password: 'legacy-hash',
    });

    expect(normalized.credentialStorage).toBe('legacy');
    expect(normalized.used).toBe(false);
    expect(normalized.verified).toBe(false);
    expect(normalized.inboxStatus).toBe('unknown');
  });

  it('preserves encrypted vault credentials as encrypted-vault', () => {
    const normalized = AccountStateService.normalizeAccount({
      id: 'acc-2',
      username: 'demo@example.com',
      password: encryptSecret('secret'),
      inboxStatus: 'verified',
      used: true,
      verified: true,
    });

    expect(normalized.credentialStorage).toBe('encrypted-vault');
    expect(normalized.inboxStatus).toBe('verified');
    expect(normalized.used).toBe(true);
    expect(normalized.verified).toBe(true);
  });
});
