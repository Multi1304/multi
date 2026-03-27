import { Router } from 'express';
import { prisma } from '../prisma';
import { z } from 'zod';
import { authMiddleware, AuthRequest, requireRole } from '../middleware/auth';
import { logAudit } from '../services/audit.service';
import { logger } from '../utils/logger';
import { FlowExecutorService } from '../services/flow.executor';
import { AiFingerprintService } from '../services/aiFingerprint.service';
import { AccessService } from '../services/access.service';
import { FlowContractService } from '../services/flowContract.service';
import { FlowRunAnalysisService } from '../services/flowRunAnalysis.service';
import { FlowRunHistoryService } from '../services/flowRunHistory.service';
import { FlowOperationalService } from '../services/flowOperational.service';
import { PromotionGateService } from '../services/promotionGate.service';
import { DestructiveActionService } from '../services/destructiveAction.service';

const router = Router();

// Schemas
const flowStepSchema = z.object({
  order: z.number().int().min(0).optional(),
  type: z.string(),
  config: z.any().optional().default({})
}).passthrough();

const flowTriggerSchema = z.object({
  type: z.string(),
  config: z.any().optional(),
  enabled: z.boolean().default(true)
});

const createFlowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  fingerprint: z.any().optional(),
  useAi: z.boolean().default(true),
  steps: z.array(flowStepSchema).optional(),
  triggers: z.array(flowTriggerSchema).optional()
});

const updateFlowSchema = createFlowSchema.partial();
const promotionSchema = z.object({
  target: z.enum(['recommended', 'default']),
});

import { AiProfileService } from '../services/aiProfile.service';
import { AccessibilityService } from '../services/accessibility.service';

const RUN_LAUNCH_GUARD_WINDOW_MS = 2 * 60 * 1000;
const activeRunLaunches = new Map<string, number>();

function getRunLaunchKey(tenantId: string, flowId: string) {
  return `${tenantId}:${flowId}`;
}

function hasFreshLaunchGuard(key: string) {
  const startedAt = activeRunLaunches.get(key);
  if (!startedAt) return false;
  if (Date.now() - startedAt > RUN_LAUNCH_GUARD_WINDOW_MS) {
    activeRunLaunches.delete(key);
    return false;
  }
  return true;
}

async function launchFlowExecution(flowId: string, tenantId: string, userId: string, role: string, variables: Record<string, any> = {}, sourceRunId?: string | null) {
  const canExecute = await AccessService.canAccess(userId, tenantId, role, 'flow', flowId, 'EXECUTE');
  if (!canExecute) {
    return { statusCode: 403, payload: { error: 'Access denied' } };
  }

  const launchKey = getRunLaunchKey(tenantId, flowId);
  const flow = await (prisma as any).flow.findUnique({
    where: { id: flowId },
    select: { steps: true }
  });
  if (!flow) {
    return { statusCode: 404, payload: { error: 'Flow not found' } };
  }

  const contract = FlowContractService.validateRunVariables(flow.steps || [], variables || {});
  if (!contract.valid) {
    return {
      statusCode: 422,
      payload: {
        error: 'Flow contract validation failed',
        contract
      }
    };
  }

  const existingRunningRun = await (prisma as any).flowRun.findFirst({
    where: {
      flowId,
      tenantId,
      status: 'running',
      startedAt: {
        gte: new Date(Date.now() - RUN_LAUNCH_GUARD_WINDOW_MS)
      }
    },
    orderBy: { startedAt: 'desc' }
  });

  if (existingRunningRun) {
    return {
      statusCode: 202,
      payload: {
        status: 'running',
        deduplicated: true,
        runId: existingRunningRun.id,
        message: 'An active run already exists for this flow'
      }
    };
  }

  if (hasFreshLaunchGuard(launchKey)) {
    return {
      statusCode: 202,
      payload: {
        status: 'running',
        deduplicated: true,
        message: 'Flow launch already in progress'
      }
    };
  }

  activeRunLaunches.set(launchKey, Date.now());

  const newFlowRun = await (prisma as any).flowRun.create({
    data: {
      flowId,
      tenantId,
      status: 'running',
      startedAt: new Date(),
      result: {
        inputVariables: variables || {},
        requestedBy: userId,
        retryOfRunId: sourceRunId || null,
      }
    }
  });

  FlowExecutorService.runFlow(flowId, tenantId, variables || {}, newFlowRun.id)
    .catch(err => {
      logger.error('Background flow execution failed', { flowId, runId: newFlowRun.id, error: err.message });
    })
    .finally(() => {
      activeRunLaunches.delete(launchKey);
    });

  return {
    statusCode: 200,
    payload: {
      status: 'running',
      runId: newFlowRun.id,
      retryOfRunId: sourceRunId || null,
      message: sourceRunId ? 'Flow retry triggered in background' : 'Flow triggered in background'
    }
  };
}

// Routes
router.use(authMiddleware);

// POST /flows/recommend - Suggest a flow sequence based on a goal
router.post('/recommend', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const { goal } = req.body;
    if (!goal) return res.status(400).json({ error: 'Goal is required' });
    const suggestion = await AiProfileService.recommendFlow(goal);
    res.json({ recommendedFlow: suggestion });
  } catch (err: any) {
    logger.error('Error recommending flow', { error: err?.message });
    res.status(500).json({ error: 'Internal AI error' });
  }
});

router.post('/validate', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];
    const hasVariables = req.body && Object.prototype.hasOwnProperty.call(req.body, 'variables');
    const variables = req.body?.variables || {};
    const report = hasVariables
      ? FlowContractService.validateRunVariables(steps, variables)
      : FlowContractService.buildFlowContract(steps);
    return res.status(report.valid ? 200 : 422).json(report);
  } catch (err: any) {
    logger.error('Error validating flow contract', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /flows/runs - List flow execution history
router.get('/runs', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const runs = await (prisma as any).flowRun.findMany({
      where: { tenantId },
      include: {
        flow: { select: { name: true, steps: true } },
        steps: true
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    const analyzedRuns = runs.map((run: any) => FlowRunAnalysisService.augmentRun(run));
    res.json(FlowRunHistoryService.augmentRunHistory(analyzedRuns));
  } catch (error: any) {
    logger.error('Error listing flow runs', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch flow runs' });
  }
});

// V3 Eje 6 Accessibility: POST /flows/voice-to-flow
router.post('/voice-to-flow', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const { transcript } = req.body;
    if (!transcript) return res.status(400).json({ error: 'Voice transcript is required' });

    const result = await AccessibilityService.voiceToFlow(transcript);
    if (!result.success) return res.status(422).json({ error: result.error });

    res.json({ generatedSteps: result.steps });
  } catch (err: any) {
    logger.error('Voice-to-flow error', { error: err?.message });
    res.status(500).json({ error: 'Internal accessibility system error' });
  }
});

// List Flows
router.get('/', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;

    // Simplified: Always return all public flows + tenant specific flows
    const publicFlows = await (prisma as any).flow.findMany({
      where: { isPublic: true }
    });

    let tenantFlows: any[] = [];
    if (role === 'ADMIN') {
      tenantFlows = await (prisma as any).flow.findMany({
        where: { tenantId, isPublic: false }
      });
    } else {
      const sharedAcls = await (prisma as any).accessControl.findMany({
        where: { userId, tenantId, resourceType: 'flow' },
        select: { resourceId: true }
      });
      const sharedIds = sharedAcls.map((a: any) => a.resourceId);

      tenantFlows = await (prisma as any).flow.findMany({
        where: {
          OR: [
            { tenantId, userId, isPublic: false },
            { id: { in: sharedIds } }
          ]
        }
      });
    }

    const registry = await PromotionGateService.getRegistry(tenantId);
    res.json([...publicFlows, ...tenantFlows].map((flow: any) => ({
      ...flow,
      promotion: registry.flows[flow.id] || null,
    })));
  } catch (error: any) {
    logger.error('Error listing flows', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch flows' });
  }
});

// Get Flow
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const canRead = await AccessService.canAccess(userId, tenantId, role, 'flow', req.params.id, 'READ');
    if (!canRead) return res.status(403).json({ error: 'Access denied' });

    const flow = await (prisma as any).flow.findUnique({
      where: { id: req.params.id }
    });

    if (!flow) {
      return res.status(404).json({ error: 'Flow not found' });
    }

    const [contract, registry] = await Promise.all([
      Promise.resolve(FlowContractService.buildFlowContract(flow.steps || [])),
      PromotionGateService.getRegistry(tenantId),
    ]);
    res.json({ ...flow, contract, promotion: registry.flows[flow.id] || null });
  } catch (error: any) {
    logger.error('Error getting flow', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch flow' });
  }
});

router.post('/:id/promote', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const { target } = promotionSchema.parse(req.body);
    const result = await PromotionGateService.promote(tenantId, 'flow', req.params.id, target, userId);
    if (!result.ok) {
      return res.status(422).json(result);
    }
    await logAudit({
      tenantId,
      userId,
      action: 'flow.promoted',
      resource: `flow:${req.params.id}`,
      detail: { target, gateSnapshotId: result.snapshot.id, score: result.evaluation.score },
    });
    res.json(result);
  } catch (error: any) {
    logger.error('Error promoting flow', { error: error.message });
    res.status(500).json({ error: 'Failed to promote flow' });
  }
});

router.delete('/:id/promote', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    await PromotionGateService.clearPromotion(tenantId, 'flow', req.params.id);
    await logAudit({
      tenantId,
      userId,
      action: 'flow.promotion_cleared',
      resource: `flow:${req.params.id}`,
    });
    res.status(204).end();
  } catch (error: any) {
    logger.error('Error clearing flow promotion', { error: error.message });
    res.status(500).json({ error: 'Failed to clear flow promotion' });
  }
});

router.get('/:id/operations', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const canRead = await AccessService.canAccess(userId, tenantId, role, 'flow', req.params.id, 'READ');
    if (!canRead) return res.status(403).json({ error: 'Access denied' });

    const runs = await FlowOperationalService.listForFlow(tenantId, req.params.id, 12);
    const summary = FlowOperationalService.summarize(runs);
    return res.json({
      flowId: req.params.id,
      summary,
      runs,
    });
  } catch (error: any) {
    logger.error('Error loading flow operations', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch flow operations' });
  }
});

router.get('/:id/access', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const canRead = await AccessService.canAccess(userId, tenantId, role, 'flow', req.params.id, 'READ');
    if (!canRead) return res.status(403).json({ error: 'Access denied' });

    const [grants, effectivePermissions] = await Promise.all([
      (AccessService as any).listResourceAccess(tenantId, 'flow', req.params.id),
      (AccessService as any).getEffectivePermissions(userId, tenantId, role, 'flow', req.params.id)
    ]);

    return res.json({
      resourceType: 'flow',
      resourceId: req.params.id,
      effectivePermissions,
      grants
    });
  } catch (error: any) {
    logger.error('Error getting flow access', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch flow access' });
  }
});

router.post('/:id/share', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;
    const { targetUserId, permission } = req.body;

    if (!targetUserId || !permission) return res.status(400).json({ error: 'targetUserId and permission required' });

    const canWrite = await AccessService.canAccess(userId, tenantId, role, 'flow', req.params.id, 'WRITE');
    if (!canWrite) return res.status(403).json({ error: 'Must have WRITE permissions to share' });

    await AccessService.grantAccess(userId, targetUserId, tenantId, 'flow', req.params.id, permission);

    await logAudit({
      tenantId,
      userId,
      action: 'flow.share',
      resource: `flow:${req.params.id}`,
      detail: { targetUserId, permission },
    });

    return res.json({ success: true, message: `Flow shared with ${permission} access` });
  } catch (error: any) {
    logger.error('Error sharing flow', { error: error.message });
    res.status(500).json({ error: 'Failed to share flow' });
  }
});

router.delete('/:id/share/:targetUserId', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const canWrite = await AccessService.canAccess(userId, tenantId, role, 'flow', req.params.id, 'WRITE');
    if (!canWrite) return res.status(403).json({ error: 'Must have WRITE permissions to revoke access' });

    if (DestructiveActionService.isEnabled()) {
      const task = await DestructiveActionService.schedule({
        tenantId,
        userId,
        action: 'flow.access.revoke',
        resource: `flow:${req.params.id}`,
        payload: {
          flowId: req.params.id,
          targetUserId: req.params.targetUserId,
        },
      });
      return res.status(202).json({ queued: true, task });
    }

    await AccessService.revokeAccess(req.params.targetUserId, tenantId, 'flow', req.params.id);

    await logAudit({
      tenantId,
      userId,
      action: 'flow.access.revoke',
      resource: `flow:${req.params.id}`,
      detail: { targetUserId: req.params.targetUserId },
    });

    return res.json({ success: true });
  } catch (error: any) {
    logger.error('Error revoking flow access', { error: error.message });
    res.status(500).json({ error: 'Failed to revoke flow access' });
  }
});

// Create Flow
router.post('/', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const data = createFlowSchema.parse(req.body);

    let fingerprint = data.fingerprint;
    if (!fingerprint && data.useAi) {
      fingerprint = AiFingerprintService.generate();
    }

    const flow = await (prisma as any).flow.create({
      data: {
        tenantId: req.user!.tenantId,
        userId: req.user!.userId,
        name: data.name,
        description: data.description,
        steps: (data.steps || []).map((s, idx) => ({
          ...s,
          order: s.order !== undefined ? s.order : idx,
          config: s.config || {}
        }))
      }
    });

    const contract = FlowContractService.buildFlowContract(flow.steps || []);

    await logAudit({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: 'flow.create',
      resource: `flow:${flow.id}`,
    });

    res.status(201).json({ ...flow, contract });
  } catch (error: any) {
    console.error('FULL FLOW ERROR:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.issues });
    }
    logger.error('Error creating flow', { error: error.message });
    res.status(500).json({ error: 'Failed to create flow' });
  }
});

// Update Flow
router.patch('/:id', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const data = updateFlowSchema.parse(req.body);

    const existingFlow = await (prisma as any).flow.findUnique({
      where: { id: req.params.id }
    });

    if (!existingFlow) {
      return res.status(404).json({ error: 'Flow not found' });
    }

    const canWrite = await AccessService.canAccess(req.user!.userId, req.user!.tenantId, req.user!.role, 'flow', req.params.id, 'WRITE');
    if (!canWrite) return res.status(403).json({ error: 'Access denied' });

    const flow = await (prisma as any).flow.update({
      where: { id: req.params.id },
      data: {
        name: data.name,
        description: data.description,
        steps: data.steps !== undefined ? data.steps : undefined
      }
    });

    const contract = FlowContractService.buildFlowContract(flow.steps || []);

    await logAudit({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: 'flow.update',
      resource: `flow:${flow.id}`,
    });

    res.json({ ...flow, contract });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.issues });
    }
    logger.error('Error updating flow', { error: error.message });
    res.status(500).json({ error: 'Failed to update flow' });
  }
});

// Delete Flow
router.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const canWrite = await AccessService.canAccess(userId, tenantId, role, 'flow', req.params.id, 'WRITE');
    if (!canWrite) return res.status(403).json({ error: 'Access denied' });

    const flow = await (prisma as any).flow.findUnique({
      where: { id: req.params.id }
    });

    if (!flow || flow.tenantId !== req.user!.tenantId) {
      return res.status(404).json({ error: 'Flow not found' });
    }

    if (DestructiveActionService.isEnabled()) {
      const task = await DestructiveActionService.schedule({
        tenantId,
        userId,
        action: 'flow.delete',
        resource: `flow:${flow.id}`,
        payload: { flowId: flow.id },
      });
      return res.status(202).json({ queued: true, task });
    }

    await (prisma as any).flow.delete({
      where: { id: req.params.id }
    });

    await logAudit({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: 'flow.delete',
      resource: `flow:${flow.id}`,
    });

    res.status(204).send();
  } catch (error: any) {
    logger.error('Error deleting flow', { error: error.message });
    res.status(500).json({ error: 'Failed to delete flow' });
  }
});

// Trigger Flow Manually
router.post('/:id/run', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const result = await launchFlowExecution(
      req.params.id,
      req.user!.tenantId,
      req.user!.userId,
      req.user!.role,
      req.body?.variables || {},
      null
    );
    return res.status(result.statusCode).json(result.payload);
  } catch (error: any) {
    logger.error('Error triggering flow', { error: error.message });
    res.status(500).json({ error: error.message || 'Failed to trigger flow' });
  }
});

router.post('/runs/:runId/retry', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const run = await (prisma as any).flowRun.findFirst({
      where: {
        id: req.params.runId,
        tenantId,
      },
      include: {
        flow: {
          select: {
            id: true,
          }
        }
      }
    });

    if (!run) return res.status(404).json({ error: 'Flow run not found' });

    const retryVariables = {
      ...((run.result as any)?.inputVariables || {}),
      ...(req.body?.variables || {}),
    };

    const result = await launchFlowExecution(
      run.flowId,
      tenantId,
      req.user!.userId,
      req.user!.role,
      retryVariables,
      run.id
    );

    return res.status(result.statusCode).json(result.payload);
  } catch (error: any) {
    logger.error('Error retrying flow run', { error: error.message });
    res.status(500).json({ error: error.message || 'Failed to retry flow run' });
  }
});

export default router;
