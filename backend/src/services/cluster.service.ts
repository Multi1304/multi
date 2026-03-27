import os from 'os';
import { logger } from '../utils/logger';
import { redis } from '../utils/redis';

export interface WorkerNode {
  id: string;
  hostname: string;
  region: string;
  status: 'ACTIVE' | 'DORMANT' | 'OVERLOADED';
  cpuUsage: number;
  ramUsage: number;
  activeProfiles: number;
  lastHeartbeat: number;
}

export class ClusterService {
  private static workerId = process.env.WORKER_ID || `worker-${os.hostname()}-${process.pid}`;
  private static region = process.env.REGION || 'us-east-1'; // Default Edge Region
  private static readonly REGISTRY_KEY = 'v3:cluster:nodes';
  
  /**
   * Heartbeat for the current node.
   * Registers/Updates resource usage and status in Redis for global orchestration.
   */
  static async heartbeat(activeProfiles: number = 0) {
    try {
      const cpuUsage = os.loadavg()[0] / os.cpus().length;
      const ramUsage = (os.totalmem() - os.freemem()) / os.totalmem();
      const hostname = os.hostname();
      const status = (cpuUsage > 0.85 || ramUsage > 0.90) ? 'OVERLOADED' : 'ACTIVE';

      const nodeData: WorkerNode = {
        id: this.workerId,
        hostname,
        region: this.region,
        status,
        cpuUsage,
        ramUsage,
        activeProfiles,
        lastHeartbeat: Date.now()
      };

      // Register heartbeat with TTL of 30 seconds
      await redis.hset(this.REGISTRY_KEY, this.workerId, JSON.stringify(nodeData));
      
      // We don't want stale nodes
      // (a background sweeping worker would clean stale nodes, omitted for brevity)
      
      logger.debug('V3 Cluster Edge heartbeat', { 
        id: this.workerId, 
        region: this.region,
        cpu: cpuUsage.toFixed(2), 
        ram: (ramUsage * 100).toFixed(1) + '%' 
      });

      return nodeData;
    } catch (err: any) {
      logger.error('Failed to send cluster heartbeat', { error: err.message });
    }
  }

  /**
   * Returns the best node to run a specific profile, with optional regional preference.
   * Logic: Filters by region, finds the node with the lowest CPU/RAM load.
   */
  static async getOptimalNode(preferredRegion?: string): Promise<string> {
    try {
        const nodesData = await redis.hvals(this.REGISTRY_KEY);
        if (!nodesData || nodesData.length === 0) return this.workerId; // Fallback to self
        
        let nodes: WorkerNode[] = nodesData.map(n => JSON.parse(n));
        
        // Filter out dead nodes (no heartbeat for 60s)
        const now = Date.now();
        nodes = nodes.filter(n => now - n.lastHeartbeat < 60000 && n.status !== 'OVERLOADED');

        if (nodes.length === 0) return this.workerId;

        if (preferredRegion) {
            const regionalNodes = nodes.filter(n => n.region === preferredRegion);
            if (regionalNodes.length > 0) {
                nodes = regionalNodes;
            } else {
                logger.warn(`No healthy nodes in preferred region ${preferredRegion}, falling back to global pool.`);
            }
        }

        // Sort by load (simple heuristic: active profiles + cpu)
        nodes.sort((a, b) => (a.activeProfiles + a.cpuUsage * 10) - (b.activeProfiles + b.cpuUsage * 10));

        return nodes[0].id;

    } catch(err) {
        logger.error('Cluster Error: Cannot find optimal node', { error: err });
        return this.workerId;
    }
  }

  /**
   * Identifies if the current node is "Overloaded".
   */
  static isOverloaded(): boolean {
    const load = os.loadavg()[0] / os.cpus().length;
    return load > 0.85; // 85% CPU threshold
  }
}
