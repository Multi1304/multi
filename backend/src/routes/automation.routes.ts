import { Router } from 'express';
import { authMiddleware, AuthRequest, requireApiKeyScope } from '../middleware/auth';
import { quotaMiddleware } from '../middleware/quota';
import { enqueueJob, automationQueue } from '../queues/automation.queue';
import { prisma } from '../prisma';
import { logger } from '../utils/logger';

const router = Router();
router.use(authMiddleware);

// POST /automation/enqueue — Enqueue a new job
router.post('/enqueue', requireApiKeyScope('automation:execute'), quotaMiddleware, async (req: AuthRequest, res) => {
  try {
    const { accountId, jobType, payload } = req.body;
    const tenantId = req.user!.tenantId;

    if (!accountId) return res.status(400).json({ error: 'accountId required' });
    if (!jobType) return res.status(400).json({ error: 'jobType required' });

    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account || account.tenantId !== tenantId) {
      return res.status(403).json({ error: 'Invalid account for this tenant' });
    }

    const job = await enqueueJob(accountId, jobType, payload || {}, tenantId);

    return res.status(201).json({
      jobId: job.id,
      jobType,
      status: 'queued',
    });
  } catch (err: any) {
    logger.error('Error enqueueing job', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /automation/jobs — List jobs for tenant (with pagination)
router.get('/jobs', requireApiKeyScope('automation:read'), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const status = req.query.status as string | undefined;
    const type = req.query.type as string | undefined;
    const accountId = req.query.accountId as string | undefined;
    const profileId = req.query.profileId as string | undefined;
    const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    const where: any = { tenantId };
    if (status) where.status = status;
    if (type) where.type = type;

    if (accountId && isUuid(accountId)) {
      where.accountId = accountId;
    } else if (profileId && isUuid(profileId)) {
      // Find all accounts for this profile to filter jobs
      const profileAccounts = await prisma.account.findMany({
        where: { profileId, tenantId },
        select: { id: true },
      });
      const accountIds = profileAccounts.map(a => a.id);
      where.accountId = { in: accountIds };
    }

    const [jobs, total] = await Promise.all([
      prisma.jobLog.findMany({
        where,
        include: { account: { select: { username: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.jobLog.count({ where }),
    ]);

    return res.json({
      data: jobs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    logger.error('Error listing jobs', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /automation/jobs/:id — Get single job status
router.get('/jobs/:id', requireApiKeyScope('automation:read'), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { id } = req.params;

    const job = await (prisma.jobLog as any).findUnique({ where: { id } });
    if (!job || job.tenantId !== tenantId) {
      return res.status(404).json({ error: 'Job not found' });
    }

    return res.json(job);
  } catch (err: any) {
    logger.error('Error fetching job', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /automation/queue-stats — Queue statistics
router.get('/queue-stats', requireApiKeyScope('automation:read'), async (req: AuthRequest, res) => {
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      automationQueue.getWaitingCount(),
      automationQueue.getActiveCount(),
      automationQueue.getCompletedCount(),
      automationQueue.getFailedCount(),
      automationQueue.getDelayedCount(),
    ]);

    return res.json({ waiting, active, completed, failed, delayed });
  } catch (err: any) {
    logger.error('Error fetching queue stats', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
