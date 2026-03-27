import { describe, expect, it } from 'vitest';
import { SelectorAssistService } from '../src/services/selectorAssist.service';
import { PlatformBenchmarkService } from '../src/services/platformBenchmark.service';
import { SandboxAutomationService } from '../src/services/sandboxAutomation.service';

describe('Sandbox and selector services', () => {
  it('normalizes sandbox automation defaults', () => {
    const settings = SandboxAutomationService.normalizeSettings({});
    expect(settings.captchaProvider).toBe('manual');
    expect(settings.smsProvider).toBe('manual');
    expect(settings.allowManualResolution).toBe(true);
  });

  it('suggests selectors from a sandbox snapshot', () => {
    const snapshot = `
      <form>
        <input id="emailField" aria-label="Email address" />
        <button data-testid="submit-next">Next</button>
      </form>
    `;
    const result = SelectorAssistService.analyzeSnapshot(snapshot, {
      label: 'email',
      controlKind: 'input',
      localeHints: ['correo'],
    });
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions[0].selector).toContain('email');
  });

  it('summarizes preset and profile stability from recent runs', () => {
    const runs = [
      {
        status: 'completed',
        duration: 800,
        analysis: { errorClass: 'none' },
        result: { inputVariables: { profileId: 'profile-a', presetVersion: 'stable-v1' } }
      },
      {
        status: 'failed',
        duration: 1200,
        analysis: { errorClass: 'selector_timeout' },
        result: { inputVariables: { profileId: 'profile-a', presetVersion: 'stable-v1' } }
      },
      {
        status: 'completed',
        duration: 500,
        analysis: { errorClass: 'none' },
        result: { inputVariables: { profileId: 'profile-b', presetVersion: 'edge-v2' } }
      }
    ];

    const presetRows = PlatformBenchmarkService.summarizePresets(runs, []);
    const profileRows = PlatformBenchmarkService.summarizeProfiles(runs);
    expect(presetRows.length).toBeGreaterThan(0);
    expect(profileRows.length).toBeGreaterThan(0);
    expect(profileRows.some((row) => row.key === 'profile-a')).toBe(true);
  });
});
