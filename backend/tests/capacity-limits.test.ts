import { describe, expect, it } from 'vitest';
import { getPlanLimits, isUnlimitedLimit, resolveEffectiveSeatAllowance } from '../src/config/plans';

describe('capacity limits', () => {
  it('treats profiles, accounts and seats as unlimited across plans', () => {
    for (const plan of ['free', 'pro', 'enterprise', 'ultra']) {
      const limits = getPlanLimits(plan);
      expect(limits.maxProfiles).toBe(-1);
      expect(limits.maxAccounts).toBe(-1);
      expect(limits.maxSeats).toBe(-1);
    }
  });

  it('resolves tenant seat allowance as unlimited when plan or tenant override is unlimited', () => {
    expect(resolveEffectiveSeatAllowance('pro', 25)).toBe(-1);
    expect(resolveEffectiveSeatAllowance('free', -1)).toBe(-1);
    expect(isUnlimitedLimit(resolveEffectiveSeatAllowance('enterprise', null))).toBe(true);
  });
});
