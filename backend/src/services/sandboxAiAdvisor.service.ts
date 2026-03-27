import { AiRouterService } from './aiRouter.service';

export interface SandboxAdvisorInput {
  stage?: string;
  errorClass?: string;
  controlKind?: string;
  selector?: string;
  visibleControls?: string[];
  validationMessage?: string;
  metrics?: Record<string, any>;
}

export interface SandboxAdvisorResult {
  source: 'groq' | 'ollama' | 'heuristic';
  scope: 'sandbox_only';
  summary: string;
  recommendations: string[];
  safeActions: string[];
}

export class SandboxAiAdvisorService {
  static async advise(input: SandboxAdvisorInput, tenantId?: string): Promise<SandboxAdvisorResult> {
    const fallback = this.heuristicAdvice(input);
    try {
      const prompt = JSON.stringify({
        policy: 'sandbox_only',
        task: 'Analyze safe sandbox automation telemetry and recommend only internal debugging or contract hardening actions. Never advise bypassing third-party protections, captchas, or verification systems.',
        input,
      });

      const aiResult = await AiRouterService.chatWithMeta(
        prompt,
        'You are a sandbox automation reliability advisor. Return only JSON with keys summary, recommendations, safeActions.',
        { tenantId, taskType: 'sandbox_advisor' }
      );
      const parsed = JSON.parse(aiResult.content);
      return {
        source: aiResult.provider,
        scope: 'sandbox_only',
        summary: String(parsed.summary || fallback.summary),
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String) : fallback.recommendations,
        safeActions: Array.isArray(parsed.safeActions) ? parsed.safeActions.map(String) : fallback.safeActions,
      };
    } catch {
      return fallback;
    }
  }

  private static heuristicAdvice(input: SandboxAdvisorInput): SandboxAdvisorResult {
    const recommendations: string[] = [];
    const safeActions: string[] = [];
    const errorClass = input.errorClass || 'unknown';
    const stage = input.stage || 'unknown';

    if (errorClass === 'selector_timeout') {
      recommendations.push('Capture a fresh sandbox DOM snapshot and rerun selector assist against the expected label.');
      safeActions.push('Use selector assist on local snapshots only.');
    }
    if (errorClass === 'stage_desync' || stage === 'email') {
      recommendations.push('Add or tighten before/after stage contract checks and verify field value persistence before next-step transitions.');
      safeActions.push('Promote the failure to the preceding step instead of retrying the next stage.');
    }
    if ((input.validationMessage || '').length > 0) {
      recommendations.push('Promote validation messages into structured diagnostics and pre-click traces.');
      safeActions.push('Persist the visible validation message alongside the step contract report.');
    }
    if ((input.visibleControls || []).length > 0) {
      recommendations.push('Compare visible controls with the expected control kind and locale hints.');
      safeActions.push('Add locale-aware tokens to the contract or selector assist configuration.');
    }
    if (recommendations.length === 0) {
      recommendations.push('Collect more sandbox telemetry before applying further runtime changes.');
      safeActions.push('Increase contract diagnostics rather than adding retries.');
    }

    return {
      source: 'heuristic',
      scope: 'sandbox_only',
      summary: `Safe sandbox advisory for stage ${stage} with error class ${errorClass}.`,
      recommendations,
      safeActions,
    };
  }
}
