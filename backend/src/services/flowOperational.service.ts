import { prisma } from '../prisma';
import { FlowRunAnalysisService } from './flowRunAnalysis.service';
import { FlowRunHistoryService } from './flowRunHistory.service';

export class FlowOperationalService {
  static async listForFlow(tenantId: string, flowId: string, limit = 12) {
    const runs = await (prisma as any).flowRun.findMany({
      where: {
        tenantId,
        flowId,
      },
      include: {
        flow: { select: { name: true, steps: true } },
        steps: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const analyzedRuns = runs.map((run: any) => FlowRunAnalysisService.augmentRun(run));
    return FlowRunHistoryService.augmentRunHistory(analyzedRuns);
  }

  static summarize(runs: any[]) {
    const failed = runs.filter((run) => run.status === 'failed');
    const running = runs.filter((run) => run.status === 'running' || run.status === 'processing');
    const completed = runs.filter((run) => run.status === 'completed' || run.status === 'success');
    const retryable = runs.filter((run) => run.status === 'failed');
    const classCounts = runs.reduce((acc: Record<string, number>, run: any) => {
      const key = run?.analysis?.errorClass || 'none';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return {
      totalRuns: runs.length,
      running: running.length,
      completed: completed.length,
      failed: failed.length,
      retryable: retryable.length,
      errorClasses: classCounts,
      lastRunAt: runs[0]?.createdAt || null,
      lastFailure: failed[0] || null,
    };
  }
}
