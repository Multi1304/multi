import { Router } from 'express';
import { prisma } from '../prisma';
import { authMiddleware, AuthRequest, requireRole } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();
router.use(authMiddleware);

// POST /workers/register — Register an external worker
router.post('/register', requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { name, type, host, capabilities } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });

    // Model workerNode is missing in current schema, stubbing it out
    const worker = await (prisma as any).workerNode.create({
      data: {
        name,
        type: type || 'cloud',
        host: host || null,
        capabilities: capabilities || null,
        status: 'online',
        lastHeartbeat: new Date(),
      },
    });

    logger.info('Worker registered', { workerId: (worker as any).id, name });
    return res.status(201).json(worker);
  } catch (err: any) {
    logger.error('Worker registration error', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /workers — List registered workers
router.get('/', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const workers = await (prisma as any).workerNode.findMany();
    return res.json(workers);
  } catch (err: any) {
    logger.error('Worker list error', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
