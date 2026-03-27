import fs from 'fs-extra';
import path from 'path';
import { config } from '../config';

export class KubernetesReadinessService {
  static async getSnapshot() {
    const manifestRoot = path.resolve(process.cwd(), 'deploy', 'k8s');
    const files = await fs.readdir(manifestRoot).catch(() => []);
    const hasIngress = files.some((file) => /ingress/i.test(file));
    const hasWorker = files.some((file) => /worker/i.test(file));
    const hasApi = files.some((file) => /api/i.test(file));
    const hasAutoscaling = files.some((file) => /hpa|autoscaling/i.test(file));

    const blockers = [];
    if (!hasIngress) blockers.push('Ingress manifest missing');
    if (!hasWorker) blockers.push('Worker deployment manifest missing');
    if (!hasApi) blockers.push('API deployment manifest missing');
    if (!hasAutoscaling) blockers.push('Autoscaling manifest missing');
    if (!config.objectStorage.bucket) blockers.push('Object storage bucket is not configured for durable cluster session state');

    return {
      status: blockers.length === 0 ? 'ready' : blockers.length <= 2 ? 'caution' : 'blocked',
      manifestCount: files.length,
      blockers,
      recommendations: [
        'Keep Redis and Postgres externalized or managed before scaling above a single node.',
        'Run workers separately from the API so profile concurrency can scale independently.',
        'Use object storage for session artifacts and profile snapshots before multi-node operation.',
      ],
      thousandProfileGuidance: {
        target: 1000,
        workerShardsRecommended: 12,
        queueIsolationRecommended: true,
        regionalPoolsRecommended: true,
      },
    };
  }
}
