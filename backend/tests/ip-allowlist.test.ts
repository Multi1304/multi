import { describe, expect, it } from 'vitest';
import { isIpAllowed } from '../src/middleware/ipAllowlist';

describe('ipAllowlist', () => {
  it('allows localhost and CIDR/private matches', () => {
    expect(isIpAllowed('127.0.0.1', ['localhost'])).toBe(true);
    expect(isIpAllowed('192.168.1.45', ['private'])).toBe(true);
    expect(isIpAllowed('10.12.0.9', ['10.12.0.0/16'])).toBe(true);
    expect(isIpAllowed('10.13.0.9', ['10.12.0.0/16'])).toBe(false);
  });
});
