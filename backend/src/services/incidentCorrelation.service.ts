import { prisma } from '../prisma';
import { IncidentRecord } from './incidentCenter.service';
import { FlowRunAnalysisService } from './flowRunAnalysis.service';
import { ProfileOperationalService } from './profileOperational.service';

export class IncidentCorrelationService {
  static async enrichIncidents(
    tenantId: string,
    incidents: IncidentRecord[],
    context?: {
      sandboxLabRows?: any[];
      promotionTasks?: any[];
      profiles?: any[];
    }
  ) {
    const [runs, profiles] = await Promise.all([
      (prisma as any).flowRun.findMany({
        where: { tenantId },
        include: {
          flow: { select: { name: true, steps: true } },
          steps: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      context?.profiles
        ? Promise.resolve(context.profiles)
        : (prisma.profile as any).findMany({
            where: { tenantId },
            select: {
              id: true,
              name: true,
              platform: true,
              proxyConfig: true,
              fingerprint: true,
              fingerprintPresetId: true,
            },
            take: 100,
          }),
    ]);

    const analyzedRuns = runs.map((run: any) => FlowRunAnalysisService.augmentRun(run));
    const weakProfiles = ProfileOperationalService.summarize(profiles).weakest || [];
    const criticalSandbox = (context?.sandboxLabRows || []).filter((row: any) => row.status === 'critical').slice(0, 5);
    const promotionTasks = context?.promotionTasks || [];

    return incidents.map((incident) => ({
      ...incident,
      correlation: this.buildCorrelation(incident, analyzedRuns, weakProfiles, criticalSandbox, promotionTasks),
    }));
  }

  private static buildCorrelation(
    incident: IncidentRecord,
    analyzedRuns: any[],
    weakProfiles: any[],
    criticalSandbox: any[],
    promotionTasks: any[]
  ) {
    const failedRuns = analyzedRuns
      .filter((run: any) => ['failed', 'error'].includes(String(run.status || '').toLowerCase()))
      .slice(0, 5)
      .map((run: any) => ({
        id: run.id,
        flowName: run.flow?.name || 'Unknown flow',
        status: run.status,
        errorClass: run.analysis?.errorClass || 'runtime_error',
        failedStepId: run.analysis?.failedStepId || null,
      }));

    const queueRuns = analyzedRuns
      .filter((run: any) => ['pending', 'processing', 'failed'].includes(String(run.status || '').toLowerCase()))
      .slice(0, 5)
      .map((run: any) => ({
        id: run.id,
        flowName: run.flow?.name || 'Unknown flow',
        status: run.status,
      }));

    if (incident.code === 'release_gate_failed') {
      return {
        summary: 'Recent failed runs are the strongest signal behind the degraded gate.',
        runs: failedRuns,
        profiles: weakProfiles.slice(0, 3),
      };
    }

    if (incident.code === 'sandbox_lab_critical') {
      return {
        summary: 'Critical sandbox scenarios are dragging down compatibility.',
        scenarios: criticalSandbox.map((row: any) => ({
          scenarioId: row.scenarioId,
          name: row.name,
          version: row.version,
          contractScore: row.contractScore,
          topSuggestion: row.topSuggestion,
        })),
      };
    }

    if (incident.code === 'promotion_pressure') {
      return {
        summary: 'Promotion tasks are blocked or waiting for approval.',
        tasks: promotionTasks
          .filter((task: any) => ['pending_approval', 'blocked', 'pending_review'].includes(task.status))
          .slice(0, 5)
          .map((task: any) => ({
            id: task.id,
            resourceName: task.resourceName,
            status: task.status,
            requiredRole: task.requiredRole || null,
          })),
      };
    }

    if (incident.code === 'memory_admission_blocked') {
      return {
        summary: 'Weak profiles and current memory pressure are the likely contributors.',
        profiles: weakProfiles.slice(0, 5),
      };
    }

    if (incident.code === 'queue_pressure') {
      return {
        summary: 'Queue backlog correlates with current pending/failed runs.',
        runs: queueRuns,
      };
    }

    if (incident.code === 'runtime_hardening_degraded') {
      return {
        summary: 'Weak profiles and unstable runs are the first places to investigate.',
        runs: failedRuns.slice(0, 3),
        profiles: weakProfiles.slice(0, 5),
      };
    }

    return {
      summary: 'No strong correlation could be inferred yet.',
      runs: [],
      profiles: [],
      scenarios: [],
      tasks: [],
    };
  }
}
