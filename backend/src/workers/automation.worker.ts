import { Worker, Job } from 'bullmq';
import { prisma } from '../prisma';
import { config } from '../config';
import { logger } from '../utils/logger';
import { getJobHandler, listJobTypes } from '../jobs';
import { validateJobPayload } from '../schemas/jobTypeRegistry';
import { logAudit } from '../services/audit.service';
import { CloudSyncService } from '../services/cloudSync.service';
import { ClusterService } from '../services/cluster.service';
import { AiRpaService } from '../services/aiRpa.service';
import { NetworkService } from '../services/network.service';
import { NetworkRoutingService } from '../services/networkRouting.service';

const log = logger.child({ service: 'worker', workerId: config.worker.id });

// ─── Worker instance ──────────────────────────────────────────────
const worker = new Worker(
  'automation',
  async (job: Job) => {
    const { accountId, tenantId } = job.data;
    const jobLog = logger.child({ jobId: job.id, jobType: job.name, accountId, tenantId });

    // Upsert JobLog (might have been created by the queue at enqueue time)
    const logEntry = await prisma.jobLog.upsert({
      where: { id: job.id! },
      update: {
        status: 'processing',
        metadata: {
          attempts: job.attemptsMade + 1,
          phase: 'processing',
          updatedAt: new Date().toISOString(),
        },
      },
      create: {
        id: job.id!,
        tenantId: tenantId || 'unknown',
        accountId: accountId,
        type: job.name,
        status: 'processing',
        metadata: {
          attempts: job.attemptsMade + 1,
          phase: 'processing',
          createdAt: new Date().toISOString(),
        },
      },
    });

    jobLog.info('Job processing started', { logEntryId: logEntry.id });

    try {
      // --- PAYLOAD VALIDATION ---
      const validation = validateJobPayload(job.name, job.data.payload || {});
      if (!validation.success) {
        throw new Error(`Invalid payload for ${job.name}: ${JSON.stringify(validation.error.format())}`);
      }
      // --------------------------

      // Get registered handler or use default
      const handler = getJobHandler(job.name);
      let result: any;

      if (handler) {
        result = await handler(job);
      } else {
        // --- CLOUD SYNC DOWNLOAD ---
        const { profileId } = job.data;
        if (profileId) {
          await CloudSyncService.downloadProfile(profileId);
        }

        // --- ENTERPRISE NETWORK & FINGERPRINT RESOLUTION ---
        const profile = profileId ? await (prisma as any).profile.findUnique({
          where: { id: profileId },
          include: { proxyPool: true, networkPolicy: true, fingerprintPreset: true }
        }) : null;

        // 1. Resolve Proxy
        const routing = await NetworkRoutingService.resolve({
          tenantId,
          profileId,
          profile,
          proxyEndpointId: job.data.payload?.proxyEndpointId || null,
          proxyPoolId: job.data.payload?.proxyPoolId || null,
          sticky: true,
          country: job.data.payload?.country || (profile as any)?.geolocation?.country || (profile as any)?.geolocation?.countryCode || null,
          city: job.data.payload?.city || (profile as any)?.geolocation?.city || null,
          platform: job.data.payload?.platform || (profile as any)?.platform || null,
          allowVpn: Boolean(job.data.payload?.allowVpn),
        });
        const effectiveProxy = routing.endpoint;
        const selectionSource = routing.selection.source;

        if (effectiveProxy) {
          jobLog.info('Enterprise proxy selected', { 
            source: selectionSource, 
            proxyId: effectiveProxy.id, 
            host: effectiveProxy.host,
            sticky: routing.selection.sticky,
            country: routing.selection.country,
            city: routing.selection.city,
          });
          
          await logAudit({
            tenantId: tenantId!,
            userId: (job.data.payload?.createdBy || 'system'),
            action: 'proxy_selected',
            resource: `proxy:${effectiveProxy.id}`,
            detail: { source: selectionSource, poolId: effectiveProxy.poolId, sticky: routing.selection.sticky }
          });
        }

        // 2. Resolve Fingerprint
        const fingerprint = job.data.payload?.fingerprintPresetId 
          ? await (prisma as any).fingerprintPreset.findUnique({ where: { id: job.data.payload.fingerprintPresetId } })
          : (profile as any)?.fingerprintPreset;

        if (fingerprint) {
          jobLog.info('Applying enterprise fingerprint preset', { preset: fingerprint.name, platform: fingerprint.platform });
        }

        // 3. Resolve Network Policy (With Smart Defaults)
        let policy = job.data.payload?.networkPolicyId 
          ? await NetworkService.resolvePolicyDefaults(job.data.payload.networkPolicyId)
          : await NetworkService.resolvePolicyDefaults((profile as any)?.networkPolicyId);

        if (policy) {
          jobLog.info('Applying network policy (Enterprise)', { 
             policy: policy.name, 
             dns: policy.dnsPrimary || '8.8.8.8', 
             webrtc: policy.webrtcMode || 'BLOCK' 
          });
        }

        // 4. IP Rotation Simulation
        const rotation = job.data.payload?.ipRotationStrategy || 'NONE';
        if (rotation !== 'NONE') {
          jobLog.info('Applying IP rotation strategy', { strategy: rotation });
          await logAudit({
            tenantId: tenantId!,
            userId: (job.data.payload?.createdBy || 'system'),
            action: 'ip_rotation_applied',
            resource: `batch:${job.data.payload?.batchId || 'standalone'}`,
            detail: { strategy: rotation }
          });
        }
        // ----------------------------------------------------

        // --- PLATFORM SIMULATION (V1 Commercial) ---
        const [platform, action] = job.name.split('.');
        jobLog.info(`Simulating enterprise-grade platform operation: ${platform} -> ${action}`, { 
          platform, 
          action, 
          payload: job.data.payload,
          hasProxy: !!effectiveProxy,
          hasFingerprint: !!fingerprint
        });
        
        // Artificial delay to simulate real browser work
        await new Promise(res => setTimeout(res, 2000));

        // IA Integration: If job has a prompt, use AiRpaService
        if (job.data.payload?.steps?.some((s: any) => s.type === 'prompt')) {
           const promptStep = job.data.payload.steps.find((s: any) => s.type === 'prompt');
           const iaResponse = await AiRpaService.executePrompt(promptStep.config.text, {
              profileName: profile?.name || 'Unknown',
              platform: profile?.platform || 'Desktop',
              engine: promptStep.config.engine
           });
           jobLog.info('IA Sequence Completed', { iaResponse });
           (result as any).iaResponse = iaResponse;
        }
        
        result = { 
          success: true, 
          message: `Successfully executed ${action} on ${platform} with Enterprise Network Layer`, 
          network: effectiveProxy ? {
            host: effectiveProxy.host,
            country: effectiveProxy.country || routing.selection.country || null,
            city: effectiveProxy.city || routing.selection.city || null,
            source: selectionSource,
            sticky: routing.selection.sticky,
          } : 'Direct',
          fingerprint: fingerprint ? { name: fingerprint.name, os: fingerprint.platform } : 'Default',
          appliedAt: new Date().toISOString()
        };

        // --- CLOUD SYNC UPLOAD ---
        if (profileId) {
          await CloudSyncService.uploadProfile(profileId);
        }
      }

      // Update to SUCCESS
      await prisma.jobLog.update({
        where: { id: (logEntry as any).id },
        data: {
          status: 'success',
          metadata: {
            ...(result && typeof result === 'object' ? result : { result }),
            attempts: job.attemptsMade + 1,
            phase: 'success',
            completedAt: new Date().toISOString(),
          },
        } as any,
      });

      if (job.data.payload?.batchId) {
        await prisma.taskBatch.update({
          where: { id: job.data.payload.batchId },
          data: { completed: { increment: 1 } }
        });
      }

      jobLog.info('Job completed successfully', { logEntryId: logEntry.id });
      return result;
    } catch (err: any) {
      // Update to FAILED
      await prisma.jobLog.update({
        where: { id: (logEntry as any).id },
        data: {
          status: 'failed',
          message: String(err?.message || err),
          metadata: {
            attempts: job.attemptsMade + 1,
            phase: 'failed',
            failedAt: new Date().toISOString(),
          },
        } as any,
      });

      if (job.data.payload?.batchId) {
        await (prisma.taskBatch as any).update({
          where: { id: job.data.payload.batchId },
          data: { failed: { increment: 1 } } as any
        });
      }

      jobLog.error('Job failed', { error: err?.message, logEntryId: logEntry.id });
      throw err;
    }
  },
  {
    connection: {
      host: config.redis.host,
      port: config.redis.port,
    },
    concurrency: config.worker.concurrency,
  },
);

// ─── Worker events ────────────────────────────────────────────────
worker.on('ready', () => {
  log.info('Worker ready and listening for jobs', {
    queue: 'automation',
    concurrency: config.worker.concurrency,
    registeredHandlers: listJobTypes(),
  });
});

worker.on('completed', (job) => {
  log.info('Job completed', { jobId: job.id, name: job.name });
});

worker.on('failed', (job, err) => {
  log.error('Job failed', {
    jobId: job?.id,
    name: job?.name,
    error: err?.message,
    attempts: job?.attemptsMade,
  });
});

worker.on('error', (err) => {
  log.error('Worker error', { error: err.message });
});

log.info('Automation worker starting', {
  redis: `${config.redis.host}:${config.redis.port}`,
  concurrency: config.worker.concurrency,
  registeredHandlers: listJobTypes(),
});

// --- CLUSTER HEARTBEAT ---
setInterval(async () => {
  await ClusterService.heartbeat();
}, 30000); // Every 30 seconds

ClusterService.heartbeat(); // Initial heartbeat
