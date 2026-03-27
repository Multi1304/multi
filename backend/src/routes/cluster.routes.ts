import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth';
import { ClusterService } from '../services/cluster.service';
import os from 'os';
import { KubernetesReadinessService } from '../services/kubernetesReadiness.service';

const router = Router();
router.use(authMiddleware);

// GET /cluster/status — Get real-time health of the current node (simulating cluster view)
router.get('/status', requireRole('ADMIN'), async (req, res) => {
  try {
    const heartbeat = await ClusterService.heartbeat();
    
    // In a real V2, this would aggregate data from all nodes in Redis/DB
    const mockNodes = [
      heartbeat,
      {
        id: 'worker-edge-eu-west-1',
        hostname: 'edge-srv-01',
        status: 'ACTIVE',
        cpuUsage: 0.42,
        ramUsage: 0.35,
        activeProfiles: 124,
        lastHeartbeat: new Date(Date.now() - 5000)
      },
      {
        id: 'worker-edge-us-east-1',
        hostname: 'edge-srv-02',
        status: 'OVERLOADED',
        cpuUsage: 0.88,
        ramUsage: 0.72,
        activeProfiles: 450,
        lastHeartbeat: new Date(Date.now() - 2000)
      }
    ];

    res.json({
      totalNodes: mockNodes.length,
      globalProfiles: mockNodes.reduce((acc, n) => acc + (n?.activeProfiles || 0), 0),
      nodes: mockNodes
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch cluster status' });
  }
});

router.get('/kubernetes-readiness', requireRole('ADMIN'), async (_req, res) => {
  try {
    return res.json(await KubernetesReadinessService.getSnapshot());
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch Kubernetes readiness' });
  }
});

export default router;
