import { BrowserPolicyService } from './browserPolicy.service';
import { BrowserControlService, BrowserControlKind } from './browserControl.service';

export interface FlowContractStep {
  stepId: string;
  order: number;
  type: string;
  normalizedType: string;
  selector?: string;
  controlKind: BrowserControlKind;
  expectedBeforeStage: string | null;
  expectedAfterStage: string | null;
  requiredBindings: string[];
  preconditions: string[];
  postconditions: string[];
  maxRetries: number;
  timeoutMs: number;
  idempotentTransition: boolean;
}

export interface FlowContractReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  steps: FlowContractStep[];
  states: Array<{ stepId: string; before: string | null; after: string | null }>;
}

export class FlowContractService {
  private static resolveBindingValue(binding: string, variables: Record<string, any> = {}) {
    if (variables[binding] !== undefined) {
      return variables[binding];
    }

    return binding.split('.').reduce((acc: any, part: string) => {
      if (acc && typeof acc === 'object' && part in acc) {
        return acc[part];
      }
      return undefined;
    }, variables);
  }

  private static extractBindings(value: any): string[] {
    const results = new Set<string>();
    const visit = (node: any) => {
      if (node === null || node === undefined) return;
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      if (typeof node === 'object') {
        Object.values(node).forEach(visit);
        return;
      }
      if (typeof node !== 'string') return;
      const matches = node.match(/\{\{([^}]+)\}\}/g) || [];
      for (const match of matches) {
        results.add(match.replace(/[{}]/g, '').trim());
      }
    };
    visit(value);
    return [...results];
  }

  private static extractPromptGeneratedBindings(steps: any[]) {
    const generated = new Set<string>();

    for (const step of steps || []) {
      if (this.normalizeStepType(step?.type) !== 'prompt') continue;

      const config = {
        ...(step?.config || {}),
        ...(step?.params || {}),
        ...(step?.parameters || {}),
      };
      const promptSource = [config.prompt, config.text]
        .find((value) => typeof value === 'string' && value.trim().length > 0);

      if (typeof promptSource !== 'string') continue;

      const trimmed = promptSource.trim();
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          Object.keys(parsed).forEach((key) => generated.add(key));
          continue;
        }
      } catch {
        // Fall back to a conservative key scan for JSON-like prompt payloads.
      }

      // Liberal extraction: scan for word-like patterns and filter noise
      const keyPattern = /\b([a-zA-Z0-9_.\u00C0-\u00FF]{3,})\b/g;
      const blacklist = ['genera', 'lista', 'variables', 'identidad', 'para', 'completa', 'microsoft', 'puro', 'json', 'una', 'con'];
      let match: RegExpExecArray | null;
      while ((match = keyPattern.exec(trimmed)) !== null) {
        const k = match[1];
        if (!blacklist.includes(k.toLowerCase())) {
          generated.add(k);
        }
      }
    }

    return generated;
  }

  static normalizeStepType(type: string) {
    const normalized = (type || 'wait').toLowerCase().replace(/\s+/g, '_');
    const aliases: Record<string, string> = {
      smart_prompt: 'prompt',
      waitforselector: 'wait_for_selector',
      wait_for_element: 'wait_for_selector',
      select_option: 'select',
      pressandhold: 'press_and_hold',
    };
    return aliases[normalized] || normalized;
  }

  private static inferExpectedAfterStage(type: string, selector?: string) {
    const stage = selector ? BrowserPolicyService.inferRequiredStage(selector) : null;
    if (type === 'navigate') return stage || 'unknown';
    if (type === 'click' && selector && BrowserPolicyService.isAdvanceButton(selector)) {
      if (stage === 'email') return 'password';
      if (stage === 'password') return 'profile';
      if (stage === 'profile') return 'birth';
    }
    if (type === 'wait_for_selector') return stage;
    if (type === 'type' || type === 'select' || type === 'press_and_hold') return stage;
    return null;
  }

  static buildFlowContract(steps: any[]): FlowContractReport {
    const errors: string[] = [];
    const warnings: string[] = [];
    const contracts: FlowContractStep[] = [];
    let previousStage: string | null = null;

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index] || {};
      const normalizedType = this.normalizeStepType(step.type);
      const config = step.config || {};
      const selector = config.selector;
      const controlKind = selector ? BrowserControlService.inferKindFromSelector(selector) : 'unknown';
      const expectedBeforeStage = selector ? BrowserPolicyService.inferRequiredStage(selector) : previousStage;
      const expectedAfterStage = this.inferExpectedAfterStage(normalizedType, selector);
      const requiredBindings = this.extractBindings(config);
      const preconditions: string[] = [];
      const postconditions: string[] = [];

      if (selector) preconditions.push(`selector:${selector}`);
      if (expectedBeforeStage) preconditions.push(`stage:${expectedBeforeStage}`);
      if (requiredBindings.length) preconditions.push(`bindings:${requiredBindings.join(',')}`);

      if (expectedAfterStage) postconditions.push(`stage:${expectedAfterStage}`);
      if (normalizedType === 'type' && config.text) postconditions.push('value_written');
      if (normalizedType === 'select' && config.value !== undefined) postconditions.push('option_selected');
      if (normalizedType === 'click' && selector && BrowserPolicyService.isAdvanceButton(selector)) postconditions.push('stage_transition');
      if (normalizedType === 'press_and_hold') postconditions.push('hold_completed');

      if (['click', 'type', 'select', 'wait_for_selector', 'press_and_hold'].includes(normalizedType) && !selector) {
        errors.push(`Step ${step.id || index} is missing selector`);
      }
      if (normalizedType === 'type' && config.text === undefined) {
        errors.push(`Step ${step.id || index} is missing text`);
      }
      if (normalizedType === 'select' && config.value === undefined) {
        errors.push(`Step ${step.id || index} is missing value`);
      }
      if (normalizedType === 'press_and_hold' && config.durationMs === undefined && config.holdMs === undefined) {
        errors.push(`Step ${step.id || index} is missing durationMs`);
      }
      if (normalizedType === 'navigate' && !config.url) {
        errors.push(`Step ${step.id || index} is missing url`);
      }
      if (normalizedType === 'click' && selector && BrowserPolicyService.isAdvanceButton(selector) && controlKind !== 'button' && controlKind !== 'unknown') {
        warnings.push(`Step ${step.id || index} looks like an advance click but selector classifies as ${controlKind}`);
      }
      if (normalizedType === 'type' && controlKind === 'button') {
        warnings.push(`Step ${step.id || index} is trying to type into a button-like selector`);
      }

      const contract: FlowContractStep = {
        stepId: step.id || `step-${index}`,
        order: step.order ?? index,
        type: step.type || 'wait',
        normalizedType,
        selector,
        controlKind,
        expectedBeforeStage,
        expectedAfterStage,
        requiredBindings,
        preconditions,
        postconditions,
        maxRetries: normalizedType === 'navigate' ? 2 : normalizedType === 'wait_for_selector' ? 4 : 3,
        timeoutMs: Number(config.timeout || (normalizedType === 'navigate' ? 45000 : 30000)),
        idempotentTransition:
          (normalizedType !== 'click' || !selector || !BrowserPolicyService.isAdvanceButton(selector)) &&
          normalizedType !== 'press_and_hold',
      };

      contracts.push(contract);
      previousStage = expectedAfterStage || previousStage;
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      steps: contracts,
      states: contracts.map((step) => ({
        stepId: step.stepId,
        before: step.expectedBeforeStage,
        after: step.expectedAfterStage,
      })),
    };
  }

  static validateRunVariables(steps: any[], variables: Record<string, any> = {}) {
    const report = this.buildFlowContract(steps);
    const missing = new Set<string>();
    const generatedBindings = this.extractPromptGeneratedBindings(steps);

    for (const step of report.steps) {
      for (const binding of step.requiredBindings) {
        const resolvedValue = this.resolveBindingValue(binding, variables);
        if (resolvedValue === undefined && !generatedBindings.has(binding)) {
          missing.add(binding);
        }
      }

      const config = (steps.find((s) => (s.id || '') === step.stepId)?.config) || {};
      if (step.normalizedType === 'type' && step.controlKind === 'input' && step.selector && /email|loginfmt|member/i.test(step.selector)) {
        const emailBinding = step.requiredBindings[0];
        const candidate = emailBinding ? this.resolveBindingValue(emailBinding, variables) : undefined;
        if (candidate !== undefined && typeof candidate === 'string' && candidate.includes(' ') ) {
          report.errors.push(`Email-like binding ${emailBinding} contains spaces`);
        }
      }
    }

    if (missing.size > 0) {
      report.errors.push(`Missing variables: ${[...missing].join(', ')}`);
      report.valid = false;
    }

    return report;
  }
}
