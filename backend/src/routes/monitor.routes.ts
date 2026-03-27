import { Router } from 'express';
import { prisma } from '../prisma';
import { authMiddleware, AuthRequest, requireRole, requireApiKeyScope } from '../middleware/auth';
import { EventStream } from '../utils/sse';
import { logger } from '../utils/logger';

const router = Router();
router.use(authMiddleware);
router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return requireApiKeyScope('monitor:read')(req as any, res, next);
  }
  return requireApiKeyScope('monitor:write')(req as any, res, next);
});

// Store active SSE connections globally or per-tenant. For V1 we can use a basic memory map
const streams = new Map<string, EventStream>();

// Helper to get or create stream
function getStream(tenantId: string): EventStream {
  if (!streams.has(tenantId)) {
    streams.set(tenantId, new EventStream());
  }
  return streams.get(tenantId)!;
}

// GET /monitor/stream — Main SSE endpoint for a tenant
router.get('/stream', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), (req: AuthRequest, res) => {
  const tenantId = req.user!.tenantId;
  const stream = getStream(tenantId);
  
  stream.addClient(req, res);
  logger.debug('New SSE client connected', { tenantId, userId: req.user!.userId });
});

import { ClusterService, WorkerNode } from '../services/cluster.service';
import { redis } from '../utils/redis';
import { XaiService } from '../services/xai.service';
import { ScaleMetricsService } from '../services/scaleMetrics.service';
import { QueueService } from '../services/queue.service';
import { CompetitiveReadinessService } from '../services/competitiveReadiness.service';
import { FlowRunAnalysisService } from '../services/flowRunAnalysis.service';
import { PlatformBenchmarkService } from '../services/platformBenchmark.service';
import { ProfileOperationalService } from '../services/profileOperational.service';
import { BulkProfileOperationService } from '../services/bulkProfileOperation.service';
import { MemoryAdmissionService } from '../services/memoryAdmission.service';
import { InboxVerificationService } from '../services/inboxVerification.service';
import { SandboxAutomationService } from '../services/sandboxAutomation.service';
import { SandboxCompatibilityLabService } from '../services/sandboxCompatibilityLab.service';
import { ReleaseGateService } from '../services/releaseGate.service';
import { SoakTestService } from '../services/soakTest.service';
import { LongRunSoakService } from '../services/longRunSoak.service';
import { RuntimeHardeningService } from '../services/runtimeHardening.service';
import { ScaleReleaseCriteriaService } from '../services/scaleReleaseCriteria.service';
import { InfrastructureHealthService } from '../services/infrastructureHealth.service';
import { BenchmarkSeriesService } from '../services/benchmarkSeries.service';
import { WeeklyComparativeReportService } from '../services/weeklyComparativeReport.service';
import { PromotionAdvisorService } from '../services/promotionAdvisor.service';
import { PromotionTaskService } from '../services/promotionTask.service';
import { IncidentCenterService } from '../services/incidentCenter.service';
import { IncidentSignalService } from '../services/incidentSignal.service';
import { IncidentPlaybookService } from '../services/incidentPlaybook.service';
import { IncidentNotificationService } from '../services/incidentNotification.service';
import { IncidentCorrelationService } from '../services/incidentCorrelation.service';
import { IncidentRemediationTaskService } from '../services/incidentRemediationTask.service';
import { NetworkObservabilityService } from '../services/networkObservability.service';
import { logAudit } from '../services/audit.service';
import { z } from 'zod';
import { SecurityPostureService } from '../services/securityPosture.service';
import { DestructiveActionService } from '../services/destructiveAction.service';
import { CanaryTrapService } from '../services/canaryTrap.service';
import { SecurityPolicyService } from '../services/securityPolicy.service';
import { NotificationCenterService } from '../services/notificationCenter.service';
import { AccountHealthService } from '../services/accountHealth.service';
import { ProfileTimelineService } from '../services/profileTimeline.service';
import { ProfileReputationService } from '../services/profileReputation.service';
import { PredictiveWarmupService } from '../services/predictiveWarmup.service';
import { PredictiveWarmupQueueService } from '../services/predictiveWarmupQueue.service';
import { ProfileQuarantineService } from '../services/profileQuarantine.service';
import { KubernetesReadinessService } from '../services/kubernetesReadiness.service';
import { AiRoutingService } from '../services/aiRouting.service';

const recordReleaseGateSchema = z.object({
  releaseLabel: z.string().optional(),
  commitRef: z.string().optional(),
});
const recordSoakTestSchema = z.object({
  windowMinutes: z.number().int().min(15).max(1440).optional(),
});
const recordBenchmarkSeriesSchema = z.object({
  releaseLabel: z.string().optional(),
  commitRef: z.string().optional(),
});
const applyPromotionRecommendationSchema = z.object({
  resource: z.enum(['preset', 'flow']),
  resourceId: z.string().min(1),
  resourceName: z.string().min(1),
  action: z.enum(['promote_recommended', 'promote_default', 'review_current']),
  reasons: z.array(z.string()).optional(),
  score: z.number().optional(),
});
const resolvePromotionTaskSchema = z.object({
  resolution: z.enum(['resolved', 'dismissed']),
  note: z.string().optional(),
});
const approvePromotionTaskSchema = z.object({
  note: z.string().optional(),
});
const mutateIncidentSchema = z.object({
  note: z.string().optional(),
});
const remediateIncidentSchema = z.object({
  actionId: z.string().min(1),
});
const resolveIncidentRemediationTaskSchema = z.object({
  resolution: z.enum(['resolved', 'dismissed']),
  note: z.string().optional(),
});
const approveIncidentRemediationTaskSchema = z.object({
  note: z.string().optional(),
});
const updateIncidentSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  cooldownMinutes: z.number().int().min(1).max(1440).optional(),
  notifyWarnings: z.boolean().optional(),
  slackWebhookUrl: z.string().optional(),
  teamsWebhookUrl: z.string().optional(),
});
const destructiveActionResolveSchema = z.object({
  action: z.enum(['cancel', 'execute_now']),
});
const updateAiRoutingSettingsSchema = z.object({
  preferredProvider: z.enum(['groq', 'ollama']).optional(),
  fallbackProvider: z.enum(['groq', 'ollama']).optional(),
  softDailyRequestBudget: z.number().int().min(1).max(1_000_000).optional(),
  softDailyTokenBudget: z.number().int().min(1_000).max(100_000_000).optional(),
});

// GET /monitor/dashboard — Snapshot of the current state
router.get('/dashboard', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;

    const [profilesCount, activeAccounts, recentFlows, totalRuns, metricsSnapshot, queueStats, benchmarkRuns, auditSummary, profileRows, recentProfileOperations, inboxVerification, sandboxAutomation, sandboxLab, sandboxLabHistory, presetRows, networkObservability, securityPosture, destructiveActions, honeyEvents, notifications, accountHealth, profileReputation, nightlyWarmups, nightlyWarmupQueue, kubernetesReadiness, aiRouter] = await Promise.all([
      (prisma.profile as any).count({ where: { tenantId } }),
      (prisma.account as any).count({ where: { tenantId } }),
      (prisma as any).flowRun.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, status: true, startedAt: true, completedAt: true, flow: { select: { name: true } } }
      }),
      (prisma as any).flowRun.count({ where: { tenantId } }),
      ScaleMetricsService.getSnapshot(),
      QueueService.getRuntimeStats(),
      (prisma as any).flowRun.findMany({
        where: { tenantId },
        include: { flow: { select: { name: true, steps: true } }, steps: true },
        orderBy: { createdAt: 'desc' },
        take: 30
      }),
      prisma.auditLog.groupBy({
        by: ['action'],
        where: { tenantId },
        _count: { action: true },
        orderBy: { _count: { action: 'desc' } },
        take: 5
      }).catch(() => []),
      (prisma.profile as any).findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          platform: true,
          proxyConfig: true,
          fingerprint: true,
          fingerprintPresetId: true,
        },
        take: 100
      }),
      BulkProfileOperationService.listRecent(tenantId, 'profiles', 8),
      InboxVerificationService.summarizeForTenant(tenantId),
      SandboxAutomationService.getSettings(tenantId),
      SandboxCompatibilityLabService.evaluateAll(tenantId),
      SandboxCompatibilityLabService.getHistory(tenantId),
      (prisma.fingerprintPreset as any).findMany({
        where: { tenantId },
        select: { id: true, name: true, platform: true, browser: true, config: true },
      }),
      NetworkObservabilityService.getSnapshot(tenantId),
      SecurityPostureService.getSnapshot(tenantId),
      DestructiveActionService.list(tenantId, 12),
      CanaryTrapService.listHoneyEvents(12),
      NotificationCenterService.list(tenantId, 12),
      AccountHealthService.summarizeByTenant(tenantId),
      ProfileReputationService.rankTenant(tenantId),
      PredictiveWarmupService.listNightlyCandidates(tenantId),
      PredictiveWarmupQueueService.listQueue(tenantId),
      KubernetesReadinessService.getSnapshot(),
      AiRoutingService.getSnapshot(tenantId),
    ]);
    const quarantineSummary = await ProfileQuarantineService.summarize(tenantId, profileRows.map((row: any) => row.id));

    const analyzedBenchmarks = benchmarkRuns.map((run: any) => FlowRunAnalysisService.augmentRun(run));
    const benchmarkSummary = PlatformBenchmarkService.summarizeRuns(analyzedBenchmarks).slice(0, 5);
    const presetBenchmarks = PlatformBenchmarkService.summarizePresets(analyzedBenchmarks, profileRows).slice(0, 5);
    const profileBenchmarks = PlatformBenchmarkService.summarizeProfiles(analyzedBenchmarks).slice(0, 5);
    const profileHealth = ProfileOperationalService.summarize(profileRows);
    const runtimeHardening = RuntimeHardeningService.buildSnapshot(presetRows, profileRows);
    const releaseGates = await ReleaseGateService.maybeRecordSnapshot(tenantId);
    const soakTesting = await SoakTestService.maybeRecordSnapshot(tenantId);
    const [infrastructureHealth, benchmarkSeriesCurrent, benchmarkSeriesHistory, longRunSoak, longRunSoakHistory, weeklyReportCurrent, weeklyReportHistory] = await Promise.all([
      InfrastructureHealthService.getSnapshot(),
      BenchmarkSeriesService.maybeRecordSnapshot(tenantId),
      BenchmarkSeriesService.getHistory(tenantId),
      Promise.all([
        LongRunSoakService.evaluateProfile(tenantId, 'modest_hardware'),
        LongRunSoakService.evaluateProfile(tenantId, 'loaded_hardware'),
      ]),
      Promise.all([
        LongRunSoakService.getHistory(tenantId, 'modest_hardware'),
        LongRunSoakService.getHistory(tenantId, 'loaded_hardware'),
      ]),
      WeeklyComparativeReportService.maybeRecordSnapshot(tenantId),
      WeeklyComparativeReportService.getHistory(tenantId),
    ]);
    const benchmarkSeriesSummary = BenchmarkSeriesService.summarize(benchmarkSeriesHistory);
    const longRunSoakSummary = {
      modest_hardware: LongRunSoakService.summarize(longRunSoakHistory[0]),
      loaded_hardware: LongRunSoakService.summarize(longRunSoakHistory[1]),
    };
    const soakHistory = await SoakTestService.getHistory(tenantId);
    const releaseGateHistory = await ReleaseGateService.getHistory(tenantId);
    const releaseGateComparison = ReleaseGateService.compareSnapshots(releaseGates, releaseGateHistory[0] || null);
    const scaleRelease = await ScaleReleaseCriteriaService.evaluate(tenantId);
    const promotionAdvisor = await PromotionAdvisorService.getReport(tenantId);
    const promotionTasks = await PromotionTaskService.list(tenantId);
    const promotionAlerts = PromotionTaskService.summarize(promotionTasks);
    const incidentRemediationTasks = await IncidentRemediationTaskService.list(tenantId);
    const incidentRemediationSummary = IncidentRemediationTaskService.summarize(incidentRemediationTasks);
    const memoryAdmission = MemoryAdmissionService.snapshot();
    const profileOperationSummary = {
      processing: recentProfileOperations.filter((item: any) => item.status === 'processing').length,
      withFailures: recentProfileOperations.filter((item: any) => (item.failed || 0) > 0).length,
      retryableProfiles: recentProfileOperations.reduce((sum: number, item: any) => sum + (item.retriableProfileIds?.length || 0), 0),
    };
    const incidents = await IncidentCenterService.syncFromSignals(tenantId, {
      releaseGates,
      promotionAlerts,
      memoryAdmission,
      sandboxLab: sandboxLab.summary,
      queueDepth: queueStats,
      runtimeHardening,
    });
    const enrichedIncidents = await IncidentCorrelationService.enrichIncidents(
      tenantId,
      incidents.map((incident) => IncidentPlaybookService.enrich(incident)),
      {
        sandboxLabRows: sandboxLab.rows,
        promotionTasks,
        profiles: profileRows,
      }
    );
    const incidentSummary = IncidentCenterService.summarize(enrichedIncidents as any);
    const incidentNotifications = IncidentNotificationService.summarize(enrichedIncidents as any);
    const profileActivity = await Promise.all(
      profileRows.slice(0, 8).map(async (profile: any) => {
        const timeline = await ProfileTimelineService.getTimeline(profile.id, tenantId).catch(() => ({ heatmap: [], items: [] }));
        return {
          profileId: profile.id,
          name: profile.name,
          heatmap: timeline.heatmap || [],
          lastActivityAt: timeline.items?.[0]?.at || null,
        };
      })
    );

    // V3 Eje 5: Real-time Edge Node Discovery via Redis
    let workers: WorkerNode[] = [];
    try {
        const nodesData = await redis.hvals('v3:cluster:nodes');
        workers = nodesData.map(n => JSON.parse(n));
    } catch(e) { /* fallback if redis fails */ }

    return res.json({
      systemHealth: workers.some(w => w.status === 'OVERLOADED') ? 'degraded' : 'healthy',
      metrics: {
        totalProfiles: profilesCount,
        activeAccounts,
        totalFlowRuns: totalRuns,
        activeEdgeNodes: workers.length,
        queueDepth: queueStats,
        cache: metricsSnapshot.cache,
        durations: metricsSnapshot.durations,
        memoryAdmission,
        inboxVerification,
        sandboxAutomation,
        sandboxLab: sandboxLab.summary,
        releaseGates,
        soakTesting,
        infrastructureHealth,
        networkObservability: networkObservability.summary,
      },
      platformMetrics: {
        counters: metricsSnapshot.counters,
        gauges: metricsSnapshot.gauges,
      },
      profileHealth,
      profileOperationSummary,
      recentProfileOperations,
      benchmarks: benchmarkSummary,
      presetBenchmarks,
      profileBenchmarks,
      runtimeHardening,
      securityPosture,
      notifications,
      accountHealth,
      aiRouter,
      profileReputation,
      nightlyWarmups,
      nightlyWarmupQueue,
      kubernetesReadiness,
      quarantineSummary,
      profileActivity,
      destructiveActions,
      honeyEvents,
      benchmarkSeries: {
        current: benchmarkSeriesCurrent,
        history: benchmarkSeriesHistory.slice(0, 12),
        summary: benchmarkSeriesSummary,
      },
      weeklyReport: {
        current: weeklyReportCurrent,
        history: weeklyReportHistory,
      },
      networkObservability,
      longRunSoak,
      longRunSoakSummary,
      incidents: enrichedIncidents.slice(0, 10),
      incidentSummary,
      incidentNotifications,
      incidentRemediationTasks: incidentRemediationTasks.slice(0, 10),
      incidentRemediationSummary,
      promotionAdvisor,
      promotionTasks: promotionTasks.slice(0, 10),
      promotionAlerts,
      releaseGateHistory,
      releaseGateComparison,
      soakHistory,
      scaleRelease,
      sandboxLab: {
        summary: sandboxLab.summary,
        rows: sandboxLab.rows.slice(0, 6),
        history: sandboxLabHistory.slice(0, 5),
      },
      auditSummary,
      workers: workers.map(w => ({
          hostname: w.hostname,
          region: w.region,
          status: w.status,
          cpu: `${(w.cpuUsage * 100).toFixed(1)}%`,
          ram: `${(w.ramUsage * 100).toFixed(1)}%`
      })),
      edgeNodes: workers.map(w => ({
          hostname: w.hostname,
          region: w.region,
          status: w.status,
          cpu: `${(w.cpuUsage * 100).toFixed(1)}%`,
          ram: `${(w.ramUsage * 100).toFixed(1)}%`
      })),
      recentEvents: recentFlows.map((f: any) => ({
        id: f.id,
        event: `Flow ${f.flow?.name || 'Unknown'} - ${f.status}`,
        time: f.startedAt,
        status: f.status
      }))
    });
  } catch (err: any) {
    logger.error('Monitor dashboard error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/history', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (_req: AuthRequest, res) => {
  try {
    const history = await ScaleMetricsService.getHistory([
      'queue:camelfarm-sessions:waiting',
      'queue:camelfarm-sessions:active',
      'profiles:list_query:last_ms',
      'queue:camelfarm-sessions:failed',
    ]);
    return res.json(history);
  } catch (err: any) {
    logger.error('Monitor history error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/network-observability', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (req: AuthRequest, res) => {
  try {
    const snapshot = await NetworkObservabilityService.getSnapshot(req.user!.tenantId);
    return res.json(snapshot);
  } catch (err: any) {
    logger.error('Monitor network observability error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/readiness', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (_req: AuthRequest, res) => {
  try {
    const readiness = await CompetitiveReadinessService.getReadinessMatrix();
    return res.json(readiness);
  } catch (err: any) {
    logger.error('Monitor readiness error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/release-gates', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const [current, history] = await Promise.all([
      ReleaseGateService.getSnapshot(tenantId),
      ReleaseGateService.getHistory(tenantId),
    ]);
    return res.json({ current, history, comparison: ReleaseGateService.compareSnapshots(current, history[0] || null) });
  } catch (err: any) {
    logger.error('Monitor release gates error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/soak-tests', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const [current, history, scaleRelease] = await Promise.all([
      SoakTestService.getSnapshot(tenantId),
      SoakTestService.getHistory(tenantId),
      ScaleReleaseCriteriaService.evaluate(tenantId),
    ]);
    return res.json({ current, history, scaleRelease });
  } catch (err: any) {
    logger.error('Monitor soak tests error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/infrastructure', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (_req: AuthRequest, res) => {
  try {
    const snapshot = await InfrastructureHealthService.getSnapshot();
    return res.json(snapshot);
  } catch (err: any) {
    logger.error('Monitor infrastructure error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/soak-tests/record', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const body = recordSoakTestSchema.parse(req.body || {});
    const snapshot = await SoakTestService.recordSnapshot(req.user!.tenantId, body.windowMinutes);
    await logAudit({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: 'soak.snapshot.recorded',
      resource: 'soak_test',
      detail: { windowMinutes: body.windowMinutes || null, overallScore: snapshot.overallScore, status: snapshot.status },
    });
    return res.json(snapshot);
  } catch (err: any) {
    logger.error('Monitor soak record error', { error: err?.message });
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
});

router.get('/benchmark-series', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const [current, history] = await Promise.all([
      BenchmarkSeriesService.getSnapshot(tenantId),
      BenchmarkSeriesService.getHistory(tenantId),
    ]);
    return res.json({ current, history, summary: BenchmarkSeriesService.summarize(history) });
  } catch (err: any) {
    logger.error('Monitor benchmark series error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/benchmark-series/record', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const body = recordBenchmarkSeriesSchema.parse(req.body || {});
    const snapshot = await BenchmarkSeriesService.recordSnapshot(req.user!.tenantId, body);
    await logAudit({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: 'benchmark_series.recorded',
      resource: 'benchmark_series',
      detail: {
        releaseLabel: body.releaseLabel || null,
        commitRef: body.commitRef || null,
        score: snapshot.overall.averageStabilityScore,
      },
    });
    return res.json(snapshot);
  } catch (err: any) {
    logger.error('Monitor benchmark series record error', { error: err?.message });
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
});

router.get('/weekly-report', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const [current, history] = await Promise.all([
      WeeklyComparativeReportService.getSnapshot(tenantId),
      WeeklyComparativeReportService.getHistory(tenantId),
    ]);
    return res.json({ current, history });
  } catch (err: any) {
    logger.error('Monitor weekly report error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/weekly-report/record', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const snapshot = await WeeklyComparativeReportService.recordSnapshot(req.user!.tenantId);
    await logAudit({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: 'weekly_report.recorded',
      resource: 'weekly_report',
      detail: {
        trend: snapshot.summary.trend,
        releaseReadiness: snapshot.summary.releaseReadiness,
        overallDelta: snapshot.summary.overallDelta,
      },
    });
    return res.json(snapshot);
  } catch (err: any) {
    logger.error('Monitor weekly report record error', { error: err?.message });
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
});

router.get('/long-run-soak', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const [current, modestHistory, loadedHistory] = await Promise.all([
      Promise.all([
        LongRunSoakService.evaluateProfile(tenantId, 'modest_hardware'),
        LongRunSoakService.evaluateProfile(tenantId, 'loaded_hardware'),
      ]),
      LongRunSoakService.getHistory(tenantId, 'modest_hardware'),
      LongRunSoakService.getHistory(tenantId, 'loaded_hardware'),
    ]);
    return res.json({
      current,
      history: {
        modest_hardware: modestHistory,
        loaded_hardware: loadedHistory,
      },
    });
  } catch (err: any) {
    logger.error('Monitor long run soak error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/long-run-soak/record', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const snapshots = await LongRunSoakService.recordAllProfiles(req.user!.tenantId);
    await logAudit({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: 'long_run_soak.recorded',
      resource: 'long_run_soak',
      detail: snapshots.map((item) => ({ profile: item.profile, score: item.overallScore, status: item.status })),
    });
    return res.json(snapshots);
  } catch (err: any) {
    logger.error('Monitor long run soak record error', { error: err?.message });
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
});

router.get('/scale-release', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (req: AuthRequest, res) => {
  try {
    const evaluation = await ScaleReleaseCriteriaService.evaluate(req.user!.tenantId);
    return res.json(evaluation);
  } catch (err: any) {
    logger.error('Monitor scale release error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/promotion-advisor', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (req: AuthRequest, res) => {
  try {
    const report = await PromotionAdvisorService.getReport(req.user!.tenantId);
    return res.json(report);
  } catch (err: any) {
    logger.error('Monitor promotion advisor error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/promotion-tasks', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (req: AuthRequest, res) => {
  try {
    const tasks = await PromotionTaskService.list(req.user!.tenantId);
    return res.json({
      tasks,
      summary: PromotionTaskService.summarize(tasks),
      approvals: PromotionTaskService.filterForRole(tasks as any, req.user!.role),
    });
  } catch (err: any) {
    logger.error('Monitor promotion tasks error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/incidents', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const [signals, metricsSnapshot, notificationSettings, remediationTasks] = await Promise.all([
      IncidentSignalService.collect(tenantId),
      ScaleMetricsService.getSnapshot(),
      IncidentNotificationService.getSettings(tenantId),
      IncidentRemediationTaskService.list(tenantId),
    ]);
    const incidents = await IncidentCenterService.syncFromSignals(tenantId, signals);
    const enrichedIncidents = await IncidentCorrelationService.enrichIncidents(
      tenantId,
      incidents.map((incident) => IncidentPlaybookService.enrich(incident))
    );
    return res.json({
      incidents: enrichedIncidents,
      summary: IncidentCenterService.summarize(enrichedIncidents as any),
      remediationTasks,
      remediationSummary: IncidentRemediationTaskService.summarize(remediationTasks),
      remediationApprovals: IncidentRemediationTaskService.filterForRole(remediationTasks, req.user!.role),
      queueDepth: signals.queueDepth,
      runtimeHardening: signals.runtimeHardening,
      metrics: metricsSnapshot,
      notificationSettings,
      notificationSummary: IncidentNotificationService.summarize(enrichedIncidents as any),
    });
  } catch (err: any) {
    logger.error('Monitor incidents error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/incident-remediation-tasks', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (req: AuthRequest, res) => {
  try {
    const tasks = await IncidentRemediationTaskService.list(req.user!.tenantId);
    return res.json({
      tasks,
      summary: IncidentRemediationTaskService.summarize(tasks),
      approvals: IncidentRemediationTaskService.filterForRole(tasks, req.user!.role),
    });
  } catch (err: any) {
    logger.error('Monitor incident remediation tasks error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/incidents/settings', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const settings = await IncidentNotificationService.getSettings(req.user!.tenantId);
    return res.json(settings);
  } catch (err: any) {
    logger.error('Monitor incident settings error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/incidents/settings', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const body = updateIncidentSettingsSchema.parse(req.body || {});
    const settings = await IncidentNotificationService.updateSettings(req.user!.tenantId, body);
    await logAudit({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: 'incident.notifications.updated',
      resource: 'incident_center:notifications',
      detail: { enabled: settings.enabled, cooldownMinutes: settings.cooldownMinutes, notifyWarnings: settings.notifyWarnings },
    });
    return res.json(settings);
  } catch (err: any) {
    logger.error('Monitor incident settings update error', { error: err?.message });
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
});

router.post('/promotion-advisor/apply', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const body = applyPromotionRecommendationSchema.parse(req.body || {});
    const task = await PromotionTaskService.applyRecommendation({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      ...body,
    });
    await logAudit({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: 'promotion.task_created',
      resource: `${body.resource}:${body.resourceId}`,
      detail: { taskId: task.id, action: body.action, status: task.status, note: task.note },
    });
    return res.json(task);
  } catch (err: any) {
    logger.error('Monitor promotion apply error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/promotion-tasks/:id/resolve', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const body = resolvePromotionTaskSchema.parse(req.body || {});
    const task = await PromotionTaskService.resolveTask(
      req.user!.tenantId,
      req.params.id,
      req.user!.userId,
      body.resolution,
      body.note
    );
    await logAudit({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: 'promotion.task_resolved',
      resource: `${task.resource}:${task.resourceId}`,
      detail: { taskId: task.id, resolution: body.resolution, note: body.note || null },
    });
    return res.json(task);
  } catch (err: any) {
    logger.error('Monitor promotion task resolve error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/promotion-tasks/:id/approve', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const body = approvePromotionTaskSchema.parse(req.body || {});
    const task = await PromotionTaskService.approveTask(
      req.user!.tenantId,
      req.params.id,
      req.user!.userId,
      req.user!.role,
      body.note
    );
    await logAudit({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: 'promotion.task_approved',
      resource: `${task.resource}:${task.resourceId}`,
      detail: { taskId: task.id, status: task.status, note: body.note || null },
    });
    return res.json(task);
  } catch (err: any) {
    logger.error('Monitor promotion task approve error', { error: err?.message });
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
});

router.post('/incidents/:id/ack', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (req: AuthRequest, res) => {
  try {
    const body = mutateIncidentSchema.parse(req.body || {});
    const incident = await IncidentCenterService.acknowledge(
      req.user!.tenantId,
      req.params.id,
      req.user!.userId,
      body.note
    );
    await logAudit({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: 'incident.acknowledged',
      resource: `incident:${incident.code}`,
      detail: { incidentId: incident.id, note: body.note || null },
    });
    return res.json(incident);
  } catch (err: any) {
    logger.error('Monitor incident ack error', { error: err?.message });
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
});

router.post('/incidents/:id/resolve', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const body = mutateIncidentSchema.parse(req.body || {});
    const incident = await IncidentCenterService.resolve(
      req.user!.tenantId,
      req.params.id,
      req.user!.userId,
      body.note
    );
    await logAudit({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: 'incident.resolved',
      resource: `incident:${incident.code}`,
      detail: { incidentId: incident.id, note: body.note || null },
    });
    return res.json(incident);
  } catch (err: any) {
    logger.error('Monitor incident resolve error', { error: err?.message });
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
});

router.post('/incidents/:id/remediate', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (req: AuthRequest, res) => {
  try {
    const body = remediateIncidentSchema.parse(req.body || {});
    const incidents = await IncidentCenterService.list(req.user!.tenantId);
    const incident = incidents.find((item) => item.id === req.params.id);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found' });
    }
    const action = IncidentPlaybookService.getAction(incident, body.actionId);
    if (!action) {
      return res.status(400).json({ error: `Unknown remediation action ${body.actionId}` });
    }

    if (action.requiresApprovalRole) {
      const task = await IncidentRemediationTaskService.queueTask({
        tenantId: req.user!.tenantId,
        userId: req.user!.userId,
        incident,
        action,
      });
      await logAudit({
        tenantId: req.user!.tenantId,
        userId: req.user!.userId,
        action: 'incident.remediation_requested',
        resource: `incident:${req.params.id}`,
        detail: { actionId: body.actionId, taskId: task.id, requiredRole: task.requiredRole },
      });
      return res.json({ queued: true, task });
    }

    const result = await IncidentPlaybookService.applyAction(req.user!.tenantId, req.params.id, req.user!.userId, body.actionId);
    await logAudit({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: 'incident.remediation_applied',
      resource: `incident:${req.params.id}`,
      detail: { actionId: body.actionId, note: result.note },
    });
    return res.json(result);
  } catch (err: any) {
    logger.error('Monitor incident remediation error', { error: err?.message });
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
});

router.post('/incident-remediation-tasks/:id/approve', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const body = approveIncidentRemediationTaskSchema.parse(req.body || {});
    const task = await IncidentRemediationTaskService.approveTask(
      req.user!.tenantId,
      req.params.id,
      req.user!.userId,
      req.user!.role,
      body.note
    );
    await logAudit({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: 'incident.remediation_approved',
      resource: `incident:${task.incidentId}`,
      detail: { taskId: task.id, actionId: task.actionId, status: task.status, note: body.note || null },
    });
    return res.json(task);
  } catch (err: any) {
    logger.error('Monitor incident remediation approve error', { error: err?.message });
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
});

router.post('/incident-remediation-tasks/:id/resolve', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const body = resolveIncidentRemediationTaskSchema.parse(req.body || {});
    const task = await IncidentRemediationTaskService.resolveTask(
      req.user!.tenantId,
      req.params.id,
      req.user!.userId,
      body.resolution,
      body.note
    );
    await logAudit({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: 'incident.remediation_resolved',
      resource: `incident:${task.incidentId}`,
      detail: { taskId: task.id, resolution: body.resolution, note: body.note || null },
    });
    return res.json(task);
  } catch (err: any) {
    logger.error('Monitor incident remediation resolve error', { error: err?.message });
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
});

router.post('/incidents/notify', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const signals = await IncidentSignalService.collect(req.user!.tenantId);
    const incidents = await IncidentCenterService.syncFromSignals(req.user!.tenantId, signals);
    const summary = await IncidentNotificationService.notifyOpenIncidents(req.user!.tenantId, incidents, 'manual');
    await logAudit({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: 'incident.notifications.sent',
      resource: 'incident_center:notifications',
      detail: summary,
    });
    return res.json(summary);
  } catch (err: any) {
    logger.error('Monitor incident notify error', { error: err?.message });
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
});

router.get('/destructive-actions', requireRole('ADMIN', 'MANAGER', 'AUDITOR'), async (req: AuthRequest, res) => {
  try {
    const tasks = await DestructiveActionService.list(req.user!.tenantId, 50);
    return res.json({ tasks });
  } catch (err: any) {
    logger.error('Monitor destructive actions error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/destructive-actions/:id', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const body = destructiveActionResolveSchema.parse(req.body || {});
    if (body.action === 'execute_now') {
      const allowed = await SecurityPolicyService.isCapabilityAllowed(
        req.user!.tenantId,
        req.user!.role || 'OPERATOR',
        'executeDestructiveActions'
      );
      if (!allowed) {
        return res.status(403).json({
          error: 'Security capability denied: executeDestructiveActions',
        });
      }
    }
    const task = body.action === 'cancel'
      ? await DestructiveActionService.cancel(req.user!.tenantId, req.params.id, req.user!.userId)
      : await DestructiveActionService.executeNow(req.user!.tenantId, req.params.id, req.user!.userId);
    return res.json(task);
  } catch (err: any) {
    logger.error('Monitor destructive action mutate error', { error: err?.message });
    return res.status(500).json({ error: err?.message || 'Internal error' });
  }
});

router.get('/ai-router', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res, next) => {
  try {
    const data = await AiRoutingService.getSnapshot(req.user!.tenantId);
    return res.json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/ai-router/settings', requireRole('ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const payload = updateAiRoutingSettingsSchema.parse(req.body || {});
    const data = await AiRoutingService.updateSettings(req.user!.tenantId, payload);
    return res.json(data);
  } catch (error) {
    next(error);
  }
});

router.post('/release-gates/record', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const metadata = recordReleaseGateSchema.parse(req.body || {});
    const snapshot = await ReleaseGateService.recordSnapshot(req.user!.tenantId, metadata);
    return res.json(snapshot);
  } catch (err: any) {
    logger.error('Monitor release gate record error', { error: err?.message });
    return res.status(500).json({ error: 'Internal error' });
  }
});

// V3 Eje 5: AI-based Predictive Alerts
router.get('/anomalies', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
    try {
        const tenantId = req.user!.tenantId;
        // Fetch recent failed flow runs to analyze patterns
        const failedRuns = await (prisma as any).flowRun.findMany({
            where: { tenantId, status: 'failed' },
            orderBy: { startedAt: 'desc' },
            take: 20,
            select: { error: true, flow: { select: { name: true } } }
        });

        if (failedRuns.length === 0) return res.json({ anomalies: [], riskLevel: 'LOW' });

        // Send telemetry to Grok for predictive analysis
        const telemetryData = JSON.stringify(failedRuns);
        const prompt = `Analyze these recent automation failures and predict if there's a systemic evasion/ban risk or just local issues. Provide a short risk summary and an array of specific anomalies. Data: ${telemetryData}`;
        const systemPrompt = "You are a senior CamelFarm security analyst. Provide concise predictive insights.";
        
        try {
            const aiResponse = await XaiService.chat(prompt, systemPrompt);
            return res.json({ source: 'XAI_GROK', result: aiResponse });
        } catch (e) {
            return res.json({ riskLevel: 'UNKNOWN', message: 'AI Engine unavailable' });
        }
    } catch (err: any) {
        logger.error('Anomaly detection error', { error: err?.message });
        res.status(500).json({ error: 'Internal error' });
    }
});

// V3 Eje 5: Advanced Exports (CSV/JSON)
router.get('/export', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
    try {
        const format = req.query.format || 'json';
        const type = req.query.type || 'profiles';
        const tenantId = req.user!.tenantId;

        let data: any[] = [];
        if (type === 'profiles') {
            data = await (prisma.profile as any).findMany({ where: { tenantId }, select: { id: true, name: true, createdAt: true } });
        } else if (type === 'flows') {
            data = await (prisma as any).flowRun.findMany({ where: { tenantId }, select: { id: true, status: true, startedAt: true, error: true } });
        }

        if (format === 'csv') {
            if (data.length === 0) return res.send('No data');
            const headers = Object.keys(data[0]).join(',');
            const rows = data.map(item => Object.values(item).map(v => JSON.stringify(v || '')).join(','));
            const csv = [headers, ...rows].join('\n');
            
            res.header('Content-Type', 'text/csv');
            res.attachment(`${type}_export.csv`);
            return res.send(csv);
        }

        res.json({ exportParams: { format, type }, count: data.length, data });
    } catch (err: any) {
        logger.error('Export error', { error: err?.message });
        res.status(500).json({ error: 'Internal error' });
    }
});

// This enables firing events from other parts of the system
export const emitTenantEvent = (tenantId: string, event: string, data: any) => {
  const stream = streams.get(tenantId);
  if (stream) {
    stream.broadcast(event, data);
  }
};

export default router;
