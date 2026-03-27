import { FlowContractService } from './flowContract.service';

export class FlowRunAnalysisService {
  static classifyError(error?: string | null) {
    const message = (error || '').toLowerCase();
    if (!message) return 'none';
    if (message.includes('contract violated')) return 'contract_violation';
    if (message.includes('desynchronized')) return 'stage_desync';
    if (message.includes('advance click did not change stage')) return 'stalled_transition';
    if (message.includes('execution budget exceeded') || message.includes('timeout')) return 'selector_timeout';
    if (message.includes('verified typing failed') || message.includes('field value mismatch')) return 'value_mismatch';
    if (message.includes('invalid email input')) return 'input_validation';
    if (message.includes('mandatory step cannot be skipped')) return 'unsafe_skip';
    return 'runtime_error';
  }

  static buildStepDiagnostics(stepResult: { status: string; error?: string; output?: any }, contract?: any) {
    const errorClass = this.classifyError(stepResult.error);
    return {
      errorClass,
      contractStatus: stepResult.status === 'completed' ? 'satisfied' : errorClass === 'contract_violation' ? 'violated' : 'unknown',
      expectedBeforeStage: contract?.expectedBeforeStage || null,
      expectedAfterStage: contract?.expectedAfterStage || null,
      controlKind: contract?.controlKind || 'unknown',
      idempotentTransition: contract?.idempotentTransition ?? true,
      failedCondition: stepResult.status === 'failed'
        ? (errorClass === 'contract_violation'
          ? 'contract'
          : errorClass === 'stage_desync' || errorClass === 'stalled_transition'
            ? 'postcondition'
            : errorClass === 'input_validation' || errorClass === 'value_mismatch'
              ? 'precondition'
              : 'runtime')
        : null,
    };
  }

  static augmentRun(run: any) {
    const flowSteps = run?.flow?.steps || [];
    const contract = FlowContractService.buildFlowContract(flowSteps);
    const contractByStepId = new Map(contract.steps.map((step) => [step.stepId, step]));

    const steps = (run.steps || []).map((step: any) => {
      const contractStep = contractByStepId.get(step.stepId);
      const diagnostics = step.output?.diagnostics || this.buildStepDiagnostics(step, contractStep);
      return {
        ...step,
        contract: contractStep || null,
        analysis: diagnostics,
      };
    });

    const failedStep = steps.find((step: any) => step.status === 'failed');
    return {
      ...run,
      contract,
      steps,
      analysis: {
        failedStepId: failedStep?.stepId || null,
        errorClass: failedStep?.analysis?.errorClass || this.classifyError(run.error),
      }
    };
  }
}
