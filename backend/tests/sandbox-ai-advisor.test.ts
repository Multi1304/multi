import { describe, expect, it } from 'vitest';
import { SandboxAiAdvisorService } from '../src/services/sandboxAiAdvisor.service';

describe('SandboxAiAdvisorService', () => {
  it('returns safe heuristic advice without third-party bypass actions', async () => {
    const result = await SandboxAiAdvisorService.advise({
      stage: 'email',
      errorClass: 'stage_desync',
      controlKind: 'input',
      selector: '#email',
      visibleControls: ['input[type="email"]', 'button[type="submit"]'],
      validationMessage: 'Please enter your email address',
    });

    expect(result.scope).toBe('sandbox_only');
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.safeActions.length).toBeGreaterThan(0);
    expect(JSON.stringify(result).toLowerCase()).not.toContain('captcha bypass');
  });
});
