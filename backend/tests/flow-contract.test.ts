import { describe, expect, it } from 'vitest';
import { FlowContractService } from '../src/services/flowContract.service';
import { BrowserControlService } from '../src/services/browserControl.service';
import { FlowRunAnalysisService } from '../src/services/flowRunAnalysis.service';
import { BrowserSelectorService } from '../src/services/browserSelector.service';
import { FlowRunHistoryService } from '../src/services/flowRunHistory.service';

describe('FlowContractService', () => {
  it('builds a staged contract for a typical mixed form flow', () => {
    const steps = [
      { id: 's1', type: 'wait_for_selector', config: { selector: 'input[type="email"]' } },
      { id: 's2', type: 'type', config: { selector: 'input[type="email"]', text: '{{email}}' } },
      { id: 's3', type: 'click', config: { selector: '[type="submit"]' } },
      { id: 's4', type: 'wait_for_selector', config: { selector: 'input[type="password"]' } },
    ];

    const report = FlowContractService.buildFlowContract(steps);
    expect(report.valid).toBe(true);
    expect(report.steps[0].expectedBeforeStage).toBe('email');
    expect(report.steps[1].requiredBindings).toContain('email');
    expect(report.steps[2].postconditions).toContain('stage_transition');
  });

  it('fails preflight when required bindings are missing', () => {
    const steps = [
      { id: 's1', type: 'type', config: { selector: 'input[type="email"]', text: '{{email}}' } },
      { id: 's2', type: 'type', config: { selector: 'input[type="password"]', text: '{{password}}' } },
    ];

    const report = FlowContractService.validateRunVariables(steps, { email: 'demo@example.com' });
    expect(report.valid).toBe(false);
    expect(report.errors.join(' ')).toContain('password');
  });

  it('detects malformed steps early', () => {
    const steps = [
      { id: 's1', type: 'type', config: { selector: 'input[name="firstName"]' } },
      { id: 's2', type: 'select', config: { value: '7' } },
    ];

    const report = FlowContractService.buildFlowContract(steps);
    expect(report.valid).toBe(false);
    expect(report.errors.length).toBeGreaterThan(0);
  });

  it('assigns control kinds, budgets and idempotency from the contract', () => {
    const steps = [
      { id: 'email_wait', type: 'waitForSelector', config: { selector: 'input[type="email"]', timeout: 12000 } },
      { id: 'email_type', type: 'type', config: { selector: 'input[type="email"]', text: '{{email}}' } },
      { id: 'next_click', type: 'click', config: { selector: '[type="submit"]' } },
      { id: 'month_select', type: 'select_option', config: { selector: '[role="combobox"]', value: '{{birthMonth}}' } },
    ];

    const report = FlowContractService.buildFlowContract(steps);
    expect(report.valid).toBe(true);
    expect(report.steps[0].normalizedType).toBe('wait_for_selector');
    expect(report.steps[0].timeoutMs).toBe(12000);
    expect(report.steps[1].controlKind).toBe('input');
    expect(report.steps[2].idempotentTransition).toBe(false);
    expect(report.steps[3].controlKind).toBe('combobox');
  });

  it('classifies selectors before runtime actions', () => {
    expect(BrowserControlService.inferKindFromSelector('input[type="password"]')).toBe('password');
    expect(BrowserControlService.inferKindFromSelector('select[name="BirthMonth"]')).toBe('select');
    expect(BrowserControlService.inferKindFromSelector('[role="combobox"]')).toBe('combobox');
    expect(BrowserControlService.inferKindFromSelector('[type="submit"]')).toBe('button');
  });

  it('builds selector fallbacks and run diagnostics for monitoring', () => {
    const fallbacks = BrowserSelectorService.getFallbackSelectors('input[name="loginfmt"]');
    expect(fallbacks).toContain('input[name="loginfmt"]');
    expect(fallbacks.some((selector) => selector.includes('#i0117'))).toBe(true);

    const diagnostics = FlowRunAnalysisService.buildStepDiagnostics(
      { status: 'failed', error: 'Advance click did not change stage' },
      { expectedBeforeStage: 'email', expectedAfterStage: 'password', controlKind: 'button', idempotentTransition: false }
    );
    expect(diagnostics.errorClass).toBe('stalled_transition');
    expect(diagnostics.failedCondition).toBe('postcondition');
  });

  it('compares a run against the previous run snapshot', () => {
    const baseContract = FlowContractService.buildFlowContract([
      { id: 's1', type: 'type', config: { selector: 'input[type="email"]', text: '{{email}}' } },
      { id: 's2', type: 'click', config: { selector: '[type="submit"]' } },
    ]);

    const runs = FlowRunHistoryService.augmentRunHistory([
      {
        id: 'run-new',
        flowId: 'flow-1',
        status: 'failed',
        analysis: { errorClass: 'stalled_transition', failedStepId: 's2' },
        result: { contractSnapshot: baseContract },
        flow: { steps: [] }
      },
      {
        id: 'run-old',
        flowId: 'flow-1',
        status: 'completed',
        analysis: { errorClass: 'none', failedStepId: null },
        result: { contractSnapshot: baseContract },
        flow: { steps: [] }
      }
    ]);

    expect(runs[0].comparisonToPrevious.previousRunId).toBe(null);
    expect(runs[1].comparisonToPrevious.previousRunId).toBe('run-new');
    expect(runs[1].comparisonToPrevious.statusChanged).toBe(true);
  });
});
