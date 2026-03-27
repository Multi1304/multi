import { Router } from 'express';
import { prisma } from '../prisma';
import { authMiddleware, AuthRequest, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createTaskTemplateSchema, createBatchSchema } from '../schemas';
import { validateJobPayload } from '../schemas/jobTypeRegistry';
import { logger } from '../utils/logger';
import { logAudit } from '../services/audit.service';
import { dailyActionLimitMiddleware } from '../middleware/quota';
import { automationQueue } from '../queues/automation.queue';

export const tasksRouter = Router();
tasksRouter.use(authMiddleware);

// POST /tasks/templates
tasksRouter.post('/templates', requireRole('ADMIN', 'MANAGER'), validate(createTaskTemplateSchema), async (req: AuthRequest, res) => {
  try {
    const { name, description, jobType, payload } = req.body;

    // --- JOB TYPE VALIDATION ---
    const validation = validateJobPayload(jobType, payload);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid payload for job type', details: validation.error.format() });
    }
    // ---------------------------

    const template = await prisma.taskTemplate.create({
      data: {
        tenantId: req.user!.tenantId,
        name,
        description,
        jobType,
        payload,
        createdBy: req.user!.userId
      }
    });
    res.status(201).json(template);
  } catch (err: any) {
    logger.error('Failed to create task template', { error: err.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /tasks/templates
tasksRouter.get('/templates', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (req: AuthRequest, res) => {
  try {
    const templates = await prisma.taskTemplate.findMany({
      where: {
        OR: [
          { tenantId: req.user!.tenantId },
          { tenantId: null }
        ]
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(templates);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /tasks/batch
tasksRouter.post('/batch', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), dailyActionLimitMiddleware('maxTaskBatchesPerDay'), validate(createBatchSchema), async (req: AuthRequest, res) => {
  try {
    const { name, templateId, targetAccountIds, payloadOverride, scheduledAt } = req.body;

    const batch = await prisma.taskBatch.create({
      data: {
        tenantId: req.user!.tenantId,
        name: name || `Batch ${new Date().toISOString()}`,
        templateId,
        status: scheduledAt ? 'pending' : 'running',
        totalTasks: targetAccountIds.length,
        createdBy: req.user!.userId,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        startedAt: scheduledAt ? null : new Date(),
      }
    });

    const template = templateId ? await prisma.taskTemplate.findUnique({ where: { id: templateId } }) : null;
    const jobType = template ? template.jobType : 'custom_job';
    const basePayload = template ? (template.payload as any) : {};
    const finalPayload = { ...basePayload, ...(payloadOverride || {}) };

    // --- PAYLOAD VALIDATION ---
    const validation = validateJobPayload(jobType, finalPayload);
    if (!validation.success) {
      return res.status(400).json({ error: 'Invalid payload for job type', details: validation.error.format() });
    }
    // --------------------------

    for (const accId of targetAccountIds) {
      const job = await automationQueue.add(jobType, {
        accountId: accId,
        tenantId: req.user!.tenantId,
        payload: { ...finalPayload, batchId: batch.id },
      });

      await prisma.jobLog.create({
        data: {
          id: job.id!,
          accountId: accId,
          tenantId: req.user!.tenantId,
          type: jobType,
          status: 'pending'
        }
      });
    }

    await logAudit({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: 'task.batch.create',
      resource: `batch:${batch.id}`,
      detail: { totalTasks: targetAccountIds.length, templateId, scheduled: !!scheduledAt },
    });

    res.status(201).json(batch);
  } catch (err: any) {
    logger.error('Failed to create batch', { error: err.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /tasks/batches
tasksRouter.get('/batches', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (req: AuthRequest, res) => {
  try {
    const batches = await prisma.taskBatch.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: { createdAt: 'desc' }
    });
    res.json(batches);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /tasks/batches/:id
tasksRouter.get('/batches/:id', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (req: AuthRequest, res) => {
  try {
    const batch = await prisma.taskBatch.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId }
    });
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    res.json(batch);
  } catch (err: any) {
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /tasks/batches/:id/cancel
tasksRouter.post('/batches/:id/cancel', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const batch = await prisma.taskBatch.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId }
    });
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    
    if (batch.status === 'completed' || batch.status === 'failed') {
      return res.status(400).json({ error: 'Cannot cancel finished batch' });
    }

    await prisma.taskBatch.update({
      where: { id: batch.id },
      data: { status: 'cancelled' }
    });

    // In a real scenario we'd remove pending Jobs from BullMQ

    await logAudit({
      tenantId: req.user!.tenantId,
      userId: req.user!.userId,
      action: 'task.batch.cancel',
      resource: `batch:${batch.id}`,
      detail: { cancelledPriors: batch.totalTasks - batch.completed },
    });

    res.json({ message: 'Batch cancelled' });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /tasks/batches/:id/retry-failed
tasksRouter.post('/batches/:id/retry-failed', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (req: AuthRequest, res) => {
  try {
    const batch = await prisma.taskBatch.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId }
    });
    if (!batch) return res.status(404).json({ error: 'Batch not found' });
    
    if (batch.failed === 0) {
      return res.status(400).json({ error: 'No failed tasks to retry' });
    }

    await prisma.taskBatch.update({
      where: { id: batch.id },
      data: { status: 'running', failed: 0 } // Re-run logic in background worker
    });

    res.json({ message: 'Retrying failed tasks' });
  } catch (err: any) {
    res.status(500).json({ error: 'Internal error' });
  }
});
