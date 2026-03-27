import { describe, expect, it } from 'vitest';
import { SandboxCompatibilityLabService } from '../src/services/sandboxCompatibilityLab.service';

describe('SandboxCompatibilityLabService', () => {
  it('evaluates a snapshot-backed scenario and returns a contract score', () => {
    const evaluation = SandboxCompatibilityLabService.evaluateScenario({
      id: 'scenario-1',
      name: 'Email Step',
      version: 'v2',
      stage: 'email',
      controlKind: 'input',
      label: 'email',
      localeHints: ['correo'],
      expectedSelectors: ['#emailField', '[aria-label="Email address"]'],
      snapshot: '<div data-stage="email"><input id="emailField" aria-label="Email address" /></div>',
      tags: ['signup'],
      updatedAt: new Date().toISOString(),
    });

    expect(evaluation.contractScore).toBeGreaterThan(0);
    expect(evaluation.status).not.toBe('critical');
    expect(evaluation.topSuggestion).toBeTruthy();
  });
});
