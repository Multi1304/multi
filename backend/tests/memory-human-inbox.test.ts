import { describe, expect, it } from 'vitest';
import { MemoryAdmissionService } from '../src/services/memoryAdmission.service';
import { HumanBehaviorPolicyService } from '../src/services/humanBehaviorPolicy.service';

describe('Memory and human behavior services', () => {
  it('produces a memory admission snapshot', () => {
    const snapshot = MemoryAdmissionService.snapshot();
    expect(snapshot.rssMb).toBeGreaterThan(0);
    expect(typeof snapshot.admitted).toBe('boolean');
  });

  it('produces bounded human behavior values', async () => {
    const keypress = await HumanBehaviorPolicyService.nextKeypressDelay();
    const settle = await HumanBehaviorPolicyService.nextSettleDelay();
    const steps = await HumanBehaviorPolicyService.nextMouseSteps();

    expect(keypress).toBeGreaterThan(0);
    expect(settle).toBeGreaterThan(0);
    expect(steps).toBeGreaterThan(0);
  });
});
