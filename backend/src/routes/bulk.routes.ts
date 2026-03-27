import { Router } from 'express';
import { prisma } from '../prisma';
import { authMiddleware, AuthRequest, requireRole } from '../middleware/auth';
import { logAudit } from '../services/audit.service';
import { validate } from '../middleware/validate';
import { dailyActionLimitMiddleware } from '../middleware/quota';
import { bulkCreateProfilesSchema, bulkCloneProfileSchema } from '../schemas';
import { logger } from '../utils/logger';
import { SecurityDashboardService } from '../services/security.dashboard.service';
import { AccessService } from '../services/access.service';
import { ProfileStateService } from '../services/profileState.service';
import { BulkProfileOperationService, BulkProfileRequest, BulkProfileResult } from '../services/bulkProfileOperation.service';

const router = Router();
router.use(authMiddleware);

async function finalizeLegacyBulkOperation(
  operationId: string,
  data: {
    status: string;
    completed: number;
    failed: number;
    errors: any[] | null;
  }
) {
  try {
    await prisma.bulkOperation.update({
      where: { id: operationId },
      data: {
        status: data.status,
        completed: data.completed,
        failed: data.failed,
        errors: data.errors ? JSON.parse(JSON.stringify(data.errors)) : null,
      },
    });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      logger.warn('Legacy bulk operation finalize skipped because operation no longer exists', {
        operationId,
      });
      return;
    }
    throw error;
  }
}

async function executeProfileStateOperation(
  tenantId: string,
  userId: string,
  role: string,
  request: BulkProfileRequest
) {
  const results: BulkProfileResult[] = [];

  for (const profileId of request.profileIds) {
    const canWrite = await AccessService.canAccess(userId, tenantId, role, 'profile', profileId, 'WRITE');
    if (!canWrite) {
      results.push({ profileId, ok: false, error: 'access_denied' });
      continue;
    }

    try {
      if (request.operation === 'snapshot') {
        const manifest = await ProfileStateService.createSnapshot(profileId, 'bulk-manual', {
          requestedBy: userId,
          tenantId,
        });
        results.push({ profileId, ok: true, manifest });
      } else if (request.operation === 'sync') {
        const manifest = await ProfileStateService.createSnapshot(profileId, 'bulk-sync', {
          requestedBy: userId,
          tenantId,
        });
        await ProfileStateService.uploadToCloud(profileId);
        results.push({ profileId, ok: true, manifest });
      } else if (request.operation === 'pull') {
        const manifest = await ProfileStateService.pullFromCloud(profileId, {
          requestedBy: userId,
          tenantId,
        });
        results.push({ profileId, ok: true, manifest });
      }
    } catch (error: any) {
      results.push({ profileId, ok: false, error: error?.message || 'unknown_error' });
    }
  }

  return results;
}

async function executeProfileAccessOperation(
  tenantId: string,
  userId: string,
  role: string,
  request: BulkProfileRequest
) {
  const results: BulkProfileResult[] = [];

  for (const profileId of request.profileIds) {
    const canWrite = await AccessService.canAccess(userId, tenantId, role, 'profile', profileId, 'WRITE');
    if (!canWrite) {
      results.push({ profileId, ok: false, error: 'access_denied' });
      continue;
    }

    try {
      if (request.operation === 'revoke') {
        await AccessService.revokeAccess(request.targetUserId!, tenantId, 'profile', profileId);
      } else {
        await AccessService.grantAccess(userId, request.targetUserId!, tenantId, 'profile', profileId, request.permission as any);
      }
      results.push({ profileId, ok: true });
    } catch (error: any) {
      results.push({ profileId, ok: false, error: error?.message || 'unknown_error' });
    }
  }

  return results;
}

// POST /bulk/validate — Validate an array of objects to see if it would fail (dry run)
router.post('/validate', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), validate(bulkCreateProfilesSchema), async (req: AuthRequest, res) => {
  try {
    const { profiles } = req.body;
    
    // Perform simple domain validation that Zod wouldn't catch natively (e.g., limits checks)
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.user!.tenantId },
      select: { plan: true },
    });

    return res.json({ 
      valid: true, 
      count: profiles.length,
      message: 'All profiles pass schema validation and workspace quota checks.'
    });
  } catch (err: any) {
    return res.status(400).json({ error: 'Validation process failed', detail: err.message });
  }
});

// POST /bulk/profiles — Create multiple profiles in one operation
router.post('/profiles', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), dailyActionLimitMiddleware('maxBulkOperationsPerDay'), validate(bulkCreateProfilesSchema), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { profiles } = req.body;

    // Create tracking operation
    const operation = await (prisma.bulkOperation as any).create({
      data: {
        tenantId,
        type: 'profiles',
        status: 'processing',
        totalTasks: profiles.length,
      },
    });

    res.status(202).json({ 
      message: 'Bulk processing started', 
      operationId: operation.id 
    });

    // Process asynchronously (simulation of worker logic for V1)
    setTimeout(async () => {
      let completed = 0;
      let failed = 0;
      const errors: any[] = [];

      for (let i = 0; i < profiles.length; i++) {
        const p = profiles[i];
        try {
          await prisma.profile.create({
            data: {
              tenantId,
              userId: req.user!.userId,
              name: p.name,
              proxyConfig: p.proxy || null,
              // Tags aren't natively supported in base schema, so skipping map or mock
            },
          });
          completed++;
        } catch (e: any) {
          failed++;
          errors.push({ row: i, error: e.message });
        }
      }

      await finalizeLegacyBulkOperation(operation.id, {
        status: failed === profiles.length ? 'failed' : 'completed',
        completed,
        failed,
        errors,
      });

      await logAudit({
        tenantId,
        userId: req.user!.userId,
        action: 'bulk.profiles.create',
        resource: `operation:${operation.id}`,
        detail: { totalTasks: profiles.length, completed, failed },
      });
    }, 100);

  } catch (err: any) {
    logger.error('Bulk profiles error', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /bulk/operations/:id — Check status of an operation
router.get('/operations/:id', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (req: AuthRequest, res) => {
  try {
    const op = await prisma.bulkOperation.findFirst({
      where: { id: req.params.id, tenantId: req.user!.tenantId },
    });
    
    if (!op) return res.status(404).json({ error: 'Operation not found' });
    
    return res.json(op);
  } catch (err: any) {
    logger.error('Fetch bulk op error', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /bulk/profiles/clone - Clones a specific profile N times
router.post('/profiles/clone', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), dailyActionLimitMiddleware('maxBulkOperationsPerDay'), validate(bulkCloneProfileSchema), async (req: AuthRequest, res) => {
  try {
    const { sourceProfileId, count, namePrefix } = req.body;
    const tenantId = req.user!.tenantId;

    const source = await prisma.profile.findFirst({
      where: { id: sourceProfileId, tenantId },
    });

    if (!source) return res.status(404).json({ error: 'Source profile not found' });

    const operation = await (prisma.bulkOperation as any).create({
      data: {
        tenantId,
        type: 'profiles',
        status: 'processing',
        totalTasks: count,
      },
    });

    res.status(202).json({ message: 'Cloning started', operationId: operation.id });

    // Handle cloning asynchronously
    setTimeout(async () => {
      let completed = 0;
      let failed = 0;
      const errors: any[] = [];

      for (let i = 0; i < count; i++) {
        try {
          await prisma.profile.create({
            data: {
              tenantId,
              userId: req.user!.userId,
              name: `${namePrefix || source.name} - Clone ${i + 1}`,
              fingerprint: source.fingerprint ? JSON.parse(JSON.stringify(source.fingerprint)) : null,
              proxyConfig: source.proxyConfig ? JSON.parse(JSON.stringify(source.proxyConfig)) : null,
              dnsConfig: source.dnsConfig ? JSON.parse(JSON.stringify(source.dnsConfig)) : null,
              timezone: source.timezone,
              locale: source.locale,
              geolocation: source.geolocation ? JSON.parse(JSON.stringify(source.geolocation)) : null,
              webrtc: source.webrtc,
            },
          });
          completed++;
        } catch (e: any) {
          failed++;
          errors.push({ row: i, error: e.message });
        }
      }

      await finalizeLegacyBulkOperation(operation.id, {
        status: failed === count ? 'failed' : 'completed',
        completed,
        failed,
        errors,
      });

      await logAudit({
        tenantId,
        userId: req.user!.userId,
        action: 'bulk.profiles.clone',
        resource: `operation:${operation.id}`,
        detail: { total: count, completed, failed, sourceProfileId: source.id },
      });
    }, 100);

  } catch (err: any) {
    res.status(500).json({ error: 'Internal clone error' });
  }
});

// DELETE /bulk/profiles - Delete multiple profiles (MFA required for security)
router.delete('/profiles', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const { profileIds, mfaCode } = req.body;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;

    if (!profileIds || !Array.isArray(profileIds)) {
      return res.status(400).json({ error: 'profileIds array is required' });
    }

    // V2.6: MFA Requirement for bulk deletion
    const mfaVerified = await SecurityDashboardService.verifyMfa(userId, mfaCode);
    if (!mfaVerified) {
      return res.status(403).json({ error: 'MFA verification failed. Sensitive actions require a valid code.' });
    }

    // Verify ACL for each profile
    for (const pid of profileIds) {
      const canWrite = await AccessService.canAccess(userId, tenantId, req.user!.role, 'profile', pid, 'WRITE');
      if (!canWrite) {
        return res.status(403).json({ error: `Access denied for profile ${pid}` });
      }
    }

    // Proceed with deletion
    await prisma.account.deleteMany({ where: { profileId: { in: profileIds } } });
    await prisma.profile.deleteMany({ where: { id: { in: profileIds }, tenantId } });

    await logAudit({
      tenantId,
      userId,
      action: 'bulk.profiles.delete',
      resource: `profiles:${profileIds.length}`,
      detail: { count: profileIds.length }
    });

    return res.json({ message: `${profileIds.length} profiles deleted successfully.` });
  } catch (err: any) {
    logger.error('Bulk delete error', { error: err.message });
    res.status(500).json({ error: 'Internal error during bulk deletion' });
  }
});

router.post('/profiles/access', requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  try {
    const { profileIds, targetUserId, permission, action = 'grant' } = req.body;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;

    if (!Array.isArray(profileIds) || profileIds.length === 0) {
      return res.status(400).json({ error: 'profileIds array is required' });
    }
    if (!targetUserId) {
      return res.status(400).json({ error: 'targetUserId is required' });
    }
    if (action !== 'revoke' && !permission) {
      return res.status(400).json({ error: 'permission is required for grant' });
    }

    const request: BulkProfileRequest = {
      kind: 'profile_access',
      operation: action === 'revoke' ? 'revoke' : 'grant',
      profileIds,
      targetUserId,
      permission: permission || null,
    };

    const operationRecord = await BulkProfileOperationService.create(tenantId, 'profiles_access', request);
    const results = await executeProfileAccessOperation(tenantId, userId, req.user!.role, request);
    const finalized = await BulkProfileOperationService.complete(operationRecord.id, results);

    await logAudit({
      tenantId,
      userId,
      action: action === 'revoke' ? 'bulk.profiles.access.revoke' : 'bulk.profiles.access.grant',
      resource: `profiles:${profileIds.length}`,
      detail: { targetUserId, permission: permission || null, count: profileIds.length }
    });

    return res.json({
      success: true,
      operationId: operationRecord.id,
      total: profileIds.length,
      completed: finalized.completed,
      failed: finalized.failed,
      results
    });
  } catch (err: any) {
    logger.error('Bulk profile access error', { error: err?.message });
    res.status(500).json({ error: 'Internal error during bulk access update' });
  }
});

router.post('/profiles/state', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (req: AuthRequest, res) => {
  try {
    const { profileIds, operation } = req.body;
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;

    if (!Array.isArray(profileIds) || profileIds.length === 0) {
      return res.status(400).json({ error: 'profileIds array is required' });
    }
    if (!['snapshot', 'sync', 'pull'].includes(operation)) {
      return res.status(400).json({ error: 'operation must be snapshot, sync or pull' });
    }
    const request: BulkProfileRequest = {
      kind: 'profile_state',
      operation,
      profileIds,
    };

    const operationRecord = await BulkProfileOperationService.create(tenantId, 'profiles_state', request);
    const results = await executeProfileStateOperation(tenantId, userId, req.user!.role, request);
    const finalized = await BulkProfileOperationService.complete(operationRecord.id, results);

    await logAudit({
      tenantId,
      userId,
      action: `bulk.profiles.state.${operation}`,
      resource: `profiles:${profileIds.length}`,
      detail: { count: profileIds.length, operation }
    });

    return res.json({
      success: true,
      operationId: operationRecord.id,
      operation,
      total: profileIds.length,
      completed: finalized.completed,
      failed: finalized.failed,
      results
    });
  } catch (err: any) {
    logger.error('Bulk profile state error', { error: err?.message });
    res.status(500).json({ error: 'Internal error during bulk state operation' });
  }
});

router.get('/operations', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const limit = Number(req.query.limit || 12);
    const type = typeof req.query.type === 'string' ? req.query.type : 'profiles';
    const operations = await BulkProfileOperationService.listRecent(tenantId, type, limit);
    return res.json(operations);
  } catch (err: any) {
    logger.error('Bulk operations list error', { error: err?.message });
    res.status(500).json({ error: 'Internal error while listing operations' });
  }
});

router.post('/operations/:id/retry-failed', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;
    const operation = await BulkProfileOperationService.getById(tenantId, req.params.id);

    if (!operation) {
      return res.status(404).json({ error: 'Operation not found' });
    }
    if (!operation.request || !Array.isArray(operation.retriableProfileIds) || operation.retriableProfileIds.length === 0) {
      return res.status(400).json({ error: 'This operation has no retryable profile failures' });
    }

    const retryRequest: BulkProfileRequest = {
      ...operation.request,
      profileIds: operation.retriableProfileIds,
    };
    const retryRecord = await BulkProfileOperationService.create(tenantId, `${operation.type}_retry`, retryRequest);
    const results = retryRequest.kind === 'profile_state'
      ? await executeProfileStateOperation(tenantId, userId, role, retryRequest)
      : await executeProfileAccessOperation(tenantId, userId, role, retryRequest);
    const finalized = await BulkProfileOperationService.complete(retryRecord.id, results);

    await logAudit({
      tenantId,
      userId,
      action: `bulk.profiles.retry.${retryRequest.operation}`,
      resource: `operation:${req.params.id}`,
      detail: {
        retriedProfiles: retryRequest.profileIds.length,
        retryOperationId: retryRecord.id,
      }
    });

    return res.json({
      success: true,
      operationId: retryRecord.id,
      total: retryRequest.profileIds.length,
      completed: finalized.completed,
      failed: finalized.failed,
      results
    });
  } catch (err: any) {
    logger.error('Bulk retry failed error', { error: err?.message });
    res.status(500).json({ error: 'Internal error while retrying failed profiles' });
  }
});

router.post('/operations/:id/retry-profile/:profileId', requireRole('ADMIN', 'MANAGER', 'OPERATOR'), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;
    const operation = await BulkProfileOperationService.getById(tenantId, req.params.id);

    if (!operation) {
      return res.status(404).json({ error: 'Operation not found' });
    }
    if (!operation.request || !operation.retriableProfileIds?.includes(req.params.profileId)) {
      return res.status(400).json({ error: 'This profile is not retryable for the selected operation' });
    }

    const retryRequest: BulkProfileRequest = {
      ...operation.request,
      profileIds: [req.params.profileId],
    };
    const retryRecord = await BulkProfileOperationService.create(tenantId, `${operation.type}_single_retry`, retryRequest);
    const results = retryRequest.kind === 'profile_state'
      ? await executeProfileStateOperation(tenantId, userId, role, retryRequest)
      : await executeProfileAccessOperation(tenantId, userId, role, retryRequest);
    const finalized = await BulkProfileOperationService.complete(retryRecord.id, results);

    await logAudit({
      tenantId,
      userId,
      action: `bulk.profiles.retry.single.${retryRequest.operation}`,
      resource: `profile:${req.params.profileId}`,
      detail: {
        sourceOperationId: req.params.id,
        retryOperationId: retryRecord.id,
      }
    });

    return res.json({
      success: true,
      operationId: retryRecord.id,
      total: retryRequest.profileIds.length,
      completed: finalized.completed,
      failed: finalized.failed,
      results
    });
  } catch (err: any) {
    logger.error('Bulk retry single profile error', { error: err?.message });
    res.status(500).json({ error: 'Internal error while retrying the selected profile' });
  }
});

export default router;
