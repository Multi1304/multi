import crypto from 'crypto';
import { FlowContractService } from './flowContract.service';

export class FlowRunHistoryService {
  private static getContractSnapshot(run: any) {
    return run?.result?.contractSnapshot || FlowContractService.buildFlowContract(run?.flow?.steps || []);
  }

  private static hashSnapshot(snapshot: any) {
    return crypto.createHash('sha1').update(JSON.stringify(snapshot || {})).digest('hex');
  }

  static compareRuns(currentRun: any, previousRun: any | null) {
    if (!previousRun) {
      return {
        previousRunId: null,
        contractChanged: false,
        stepCountDelta: 0,
        statusChanged: false,
        errorClassChanged: false,
        failedStepChanged: false,
      };
    }

    const currentSnapshot = this.getContractSnapshot(currentRun);
    const previousSnapshot = this.getContractSnapshot(previousRun);
    const currentHash = this.hashSnapshot(currentSnapshot);
    const previousHash = this.hashSnapshot(previousSnapshot);

    return {
      previousRunId: previousRun.id,
      contractChanged: currentHash !== previousHash,
      stepCountDelta: (currentSnapshot?.steps?.length || 0) - (previousSnapshot?.steps?.length || 0),
      statusChanged: currentRun.status !== previousRun.status,
      errorClassChanged: (currentRun.analysis?.errorClass || 'none') !== (previousRun.analysis?.errorClass || 'none'),
      failedStepChanged: (currentRun.analysis?.failedStepId || null) !== (previousRun.analysis?.failedStepId || null),
      currentContractHash: currentHash,
      previousContractHash: previousHash,
    };
  }

  static augmentRunHistory(runs: any[]) {
    const previousByFlow = new Map<string, any>();
    return runs.map((run) => {
      const key = run.flowId;
      const previousRun = previousByFlow.get(key) || null;
      const augmented = {
        ...run,
        contractSnapshot: this.getContractSnapshot(run),
        comparisonToPrevious: this.compareRuns(run, previousRun)
      };
      previousByFlow.set(key, run);
      return augmented;
    });
  }
}
