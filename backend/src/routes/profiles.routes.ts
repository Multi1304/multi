import { Router } from 'express';
import { prisma } from '../prisma';
import { AuthRequest, requireApiKeyScope } from '../middleware/auth';
import { resourceLimitMiddleware } from '../middleware/quota';
import { logger } from '../utils/logger';

const generateFingerprint: any = (id: string) => ({ id });

import { AiFingerprintService } from '../services/aiFingerprint.service';
import { AccessService } from '../services/access.service';
import { AiProfileService } from '../services/aiProfile.service';
import { ProfileCacheService } from '../services/profileCache.service';
import { BrowserNodeService } from '../services/browser.node';
import { ProfileStateService } from '../services/profileState.service';
import { BulkProfileOperationService } from '../services/bulkProfileOperation.service';
import { NetworkRoutingService } from '../services/networkRouting.service';
import { DestructiveActionService } from '../services/destructiveAction.service';
import { ProfileTimelineService } from '../services/profileTimeline.service';
import { ProfileDoctorService } from '../services/profileDoctor.service';
import { SmartLaunchService } from '../services/smartLaunch.service';
import { ProfileEncryptionService } from '../services/profileEncryption.service';
import { ProfileQuarantineService } from '../services/profileQuarantine.service';
import { ProfileReputationService } from '../services/profileReputation.service';
import { PredictiveWarmupService } from '../services/predictiveWarmup.service';
import { PredictiveWarmupQueueService } from '../services/predictiveWarmupQueue.service';
import { ProfileDoctorAiService } from '../services/profileDoctorAi.service';
import { ProfileDecoupleAssistantService } from '../services/profileDecoupleAssistant.service';

const router = Router();

router.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return requireApiKeyScope('profile:read')(req as any, res, next);
  }
  return requireApiKeyScope('profile:write')(req as any, res, next);
});

// POST /profiles/semantic — Generate profile config from semantic prompt
router.post('/semantic', async (req: AuthRequest, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
    const suggestion = await AiProfileService.suggestProfileFromSemanticPrompt(prompt);
    res.json(suggestion);
  } catch (err: any) {
    logger.error('Error generating semantic profile', { error: err?.message });
    res.status(500).json({ error: 'Internal AI error' });
  }
});

// POST /profiles/:id/consistency — Check fingerprint consistency
router.post('/:id/consistency', async (req: AuthRequest, res) => {
  try {
    const profile = await (prisma.profile as any).findUnique({ where: { id: req.params.id } });
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    if (!profile.fingerprint) return res.status(400).json({ error: 'Profile has no fingerprint to analyze' });
    
    const analysis = await AiProfileService.checkFingerprintConsistency(profile.fingerprint);
    res.json(analysis);
  } catch (err: any) {
    logger.error('Error analyzing fingerprint', { error: err?.message });
    res.status(500).json({ error: 'Internal AI error' });
  }
});

// POST /profiles/:id/share — Share a profile with another user
router.post('/:id/share', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;
    const { targetUserId, permission } = req.body;

    if (!targetUserId || !permission) return res.status(400).json({ error: 'targetUserId and permission required' });

    // Only Owner or Admin can share
    const canWrite = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'WRITE');
    if (!canWrite) return res.status(403).json({ error: 'Must have WRITE permissions to share' });

    await (AccessService as any).grantAccess(userId, targetUserId, tenantId, 'profile', req.params.id, permission);

    // V3 Eje 4 Collaboration Log
    await require('../services/audit.service').logAudit({
        tenantId,
        userId,
        action: 'profile.share',
        resource: `profile:${req.params.id}`,
        detail: { targetUserId, permission }
    });

    res.json({ success: true, message: `Profile shared with ${permission} access` });
  } catch (err: any) {
    logger.error('Error sharing profile', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/:id/access', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const canRead = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'READ');
    if (!canRead) return res.status(403).json({ error: 'Access denied' });

    const [grants, effectivePermissions] = await Promise.all([
      (AccessService as any).listResourceAccess(tenantId, 'profile', req.params.id),
      (AccessService as any).getEffectivePermissions(userId, tenantId, role, 'profile', req.params.id)
    ]);

    return res.json({
      resourceType: 'profile',
      resourceId: req.params.id,
      effectivePermissions,
      grants
    });
  } catch (err: any) {
    logger.error('Error loading profile access', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.delete('/:id/share/:targetUserId', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const canWrite = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'WRITE');
    if (!canWrite) return res.status(403).json({ error: 'Must have WRITE permissions to revoke access' });

    if (DestructiveActionService.isEnabled()) {
      const task = await DestructiveActionService.schedule({
        tenantId,
        userId,
        action: 'profile.access.revoke',
        resource: `profile:${req.params.id}`,
        payload: {
          profileId: req.params.id,
          targetUserId: req.params.targetUserId,
        },
      });
      return res.status(202).json({ queued: true, task });
    }

    await (AccessService as any).revokeAccess(req.params.targetUserId, tenantId, 'profile', req.params.id);

    await require('../services/audit.service').logAudit({
      tenantId,
      userId,
      action: 'profile.access.revoke',
      resource: `profile:${req.params.id}`,
      detail: { targetUserId: req.params.targetUserId }
    });

    return res.json({ success: true });
  } catch (err: any) {
    logger.error('Error revoking profile access', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /profiles — List profiles (with ACL filtering)
router.get('/', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;
    const page = Number(req.query.page || 0);
    const pageSize = Number(req.query.pageSize || 0);
    const search = typeof req.query.search === 'string' ? req.query.search : '';

    if (page || pageSize || search) {
      const payload = await ProfileCacheService.getProfilesPageCached({
        tenantId,
        role,
        userId,
        page: page || 1,
        pageSize: pageSize || 50,
        search,
      });
      return res.json(payload);
    }

    const profiles = await ProfileCacheService.getProfilesListCached(tenantId, role, userId);
    return res.json(profiles);
  } catch (err: any) {
    logger.error('Error listing profiles', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const canRead = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'READ');
    if (!canRead) return res.status(403).json({ error: 'Access denied' });

    // V3: Use ProfileCacheService for ultra-fast retrieval in 10k+ profile scenarios
    const profile = await ProfileCacheService.getProfile(req.params.id);
    
    if (!profile) return res.status(404).json({ error: 'Profile not found' });
    return res.json(profile);
  } catch (err: any) {
    logger.error('Error getting profile', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /profiles — Create profile (auto-generates fingerprint)
router.post('/', resourceLimitMiddleware('profiles'), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const { name, platform, config, fingerprintPresetId } = req.body;

    if (!name) return res.status(400).json({ error: 'name is required' });

    logger.info('Attempting to create profile', { name, tenantId, userId, platform });
    const profile = await (prisma.profile as any).create({
      data: {
        name,
        tenantId,
        userId,
        platform: platform || 'DESKTOP',
        fingerprintPresetId: fingerprintPresetId || null,
      },
    });
    logger.info('Profile created successfully', { profileId: profile.id });

    // Auto-generate fingerprint (V2 uses AI by default if not provided)
    const useAi = req.body.useAi !== false;
    let fp;
    
    if (useAi) {
      const preset = fingerprintPresetId
        ? await (prisma.fingerprintPreset as any).findUnique({ where: { id: fingerprintPresetId } })
        : null;
      const aiParams = preset?.config
        ? {
            ...(preset.config || {}),
            platform: preset.platform || platform || 'DESKTOP',
            presetVersion: (preset.config as any)?.presetVersion || 'db-preset-v1',
            presetId: preset.id,
          }
        : (AiFingerprintService as any).generate(platform || 'DESKTOP', profile.id);
      // Merge AI generated params with manual overrides from the advanced config modal
      fp = { ...aiParams, ...config }; 
    } else {
      fp = { ...generateFingerprint(profile.id), ...config };
    }

    const validation = (AiFingerprintService as any).validateFingerprintConsistency(fp);
    fp.validation = validation;

    const updatedProfile = await (prisma.profile as any).update({
      where: { id: profile.id },
      data: { fingerprint: fp as any },
    });

    await ProfileCacheService.invalidateProfileLists(tenantId);

    res.status(201).json(updatedProfile);
  } catch (err: any) {
    logger.error('Error creating profile', { 
      message: err?.message, 
      stack: err?.stack,
      requestBody: req.body,
      user: req.user
    });
    res.status(500).json({ error: 'Internal error: ' + (err?.message || 'Unknown') });
  }
});

// POST /profiles/:id/launch — Launch a physical browser instance for this profile
router.post('/:id/launch', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const canRead = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'READ');
    if (!canRead) return res.status(403).json({ error: 'Access denied' });
    await ProfileQuarantineService.assertLaunchAllowed(req.params.id);

    const profile = await (prisma.profile as any).findUnique({
      where: { id: req.params.id },
      include: { proxyPool: true, networkPolicy: true },
    });
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const routing = await NetworkRoutingService.resolve({
      tenantId,
      profileId: profile.id,
      profile,
      sticky: true,
      country: (req.query.country as string) || profile?.geolocation?.country || profile?.geolocation?.countryCode || null,
      city: (req.query.city as string) || profile?.geolocation?.city || null,
      platform: (req.query.platform as string) || profile.platform || null,
      allowVpn: String(req.query.allowVpn || '').toLowerCase() === 'true',
    });

    // In local development, this opens a headless=false window on the host
    const page = await BrowserNodeService.createPage(profile.id, profile.fingerprint, routing.proxy || profile.proxyConfig);
    
    // We usually want to navigate to a default landing page or the user's last tab
    await page.goto('https://whoer.net', { waitUntil: 'load' });

    res.json({
      success: true,
      message: 'Profile launched successfully',
      network: routing.selection,
      proxyEndpointId: routing.endpoint?.id || null,
    });
  } catch (err: any) {
    logger.error('Error launching profile', { error: err?.message });
    res.status(500).json({ error: 'Failed to launch browser: ' + err.message });
  }
});

router.post('/:id/smart-launch', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const canRead = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'READ');
    if (!canRead) return res.status(403).json({ error: 'Access denied' });
    await ProfileQuarantineService.assertLaunchAllowed(req.params.id);

    const plan = await SmartLaunchService.launch(req.params.id, tenantId);
    return res.json({ success: true, plan });
  } catch (err: any) {
    logger.error('Error smart-launching profile', { error: err?.message });
    res.status(500).json({ error: 'Failed to smart-launch profile: ' + err.message });
  }
});

router.get('/:id/state', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const canRead = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'READ');
    if (!canRead) return res.status(403).json({ error: 'Access denied' });

    const state = await ProfileStateService.getStateSummary(req.params.id, tenantId);
    return res.json(state);
  } catch (err: any) {
    logger.error('Error reading profile state', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/:id/timeline', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const canRead = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'READ');
    if (!canRead) return res.status(403).json({ error: 'Access denied' });

    return res.json(await ProfileTimelineService.getTimeline(req.params.id, tenantId));
  } catch (err: any) {
    logger.error('Error loading profile timeline', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/:id/doctor', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const canRead = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'READ');
    if (!canRead) return res.status(403).json({ error: 'Access denied' });

    return res.json(await ProfileDoctorService.evaluate(req.params.id, tenantId));
  } catch (err: any) {
    logger.error('Error loading profile doctor', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/:id/encryption', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const canRead = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'READ');
    if (!canRead) return res.status(403).json({ error: 'Access denied' });

    return res.json(await ProfileEncryptionService.getSummary(req.params.id, tenantId));
  } catch (err: any) {
    logger.error('Error loading profile encryption summary', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/:id/quarantine', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;
    const canRead = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'READ');
    if (!canRead) return res.status(403).json({ error: 'Access denied' });
    return res.json(await ProfileQuarantineService.get(req.params.id));
  } catch (err: any) {
    logger.error('Error loading profile quarantine state', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/:id/quarantine', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;
    const canWrite = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'WRITE');
    if (!canWrite) return res.status(403).json({ error: 'Access denied' });
    return res.json(await ProfileQuarantineService.quarantine(req.params.id, tenantId, userId, req.body?.reason || 'manual-security-quarantine'));
  } catch (err: any) {
    logger.error('Error quarantining profile', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/:id/quarantine/release', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;
    const canWrite = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'WRITE');
    if (!canWrite) return res.status(403).json({ error: 'Access denied' });
    return res.json(await ProfileQuarantineService.release(req.params.id, tenantId, userId, req.body?.reason || 'manual-release'));
  } catch (err: any) {
    logger.error('Error releasing profile quarantine', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/:id/reputation', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;
    const canRead = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'READ');
    if (!canRead) return res.status(403).json({ error: 'Access denied' });
    return res.json(await ProfileReputationService.scoreProfile(req.params.id, tenantId));
  } catch (err: any) {
    logger.error('Error loading profile reputation', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/:id/warmup-plan', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;
    const canRead = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'READ');
    if (!canRead) return res.status(403).json({ error: 'Access denied' });
    return res.json(await PredictiveWarmupService.planForProfile(req.params.id, tenantId));
  } catch (err: any) {
    logger.error('Error loading predictive warmup plan', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/warmup/nightly', async (req: AuthRequest, res) => {
  try {
    return res.json(await PredictiveWarmupQueueService.listQueue(req.user!.tenantId));
  } catch (err: any) {
    logger.error('Error loading nightly warmup queue', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/warmup/nightly/rebuild', async (req: AuthRequest, res) => {
  try {
    return res.json(await PredictiveWarmupQueueService.rebuildNightlyQueue(req.user!.tenantId, req.user!.userId));
  } catch (err: any) {
    logger.error('Error rebuilding nightly warmup queue', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/warmup/settings', async (req: AuthRequest, res) => {
  try {
    return res.json(await PredictiveWarmupQueueService.getSettings(req.user!.tenantId));
  } catch (err: any) {
    logger.error('Error loading predictive warmup settings', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/warmup/settings', async (req: AuthRequest, res) => {
  try {
    return res.json(await PredictiveWarmupQueueService.updateSettings(req.user!.tenantId, req.body || {}, req.user!.userId));
  } catch (err: any) {
    logger.error('Error updating predictive warmup settings', { error: err?.message });
    res.status(500).json({ error: err?.message || 'Internal error' });
  }
});

router.post('/:id/warmup/queue', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;
    const canWrite = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'WRITE');
    if (!canWrite) return res.status(403).json({ error: 'Access denied' });
    const queue = await PredictiveWarmupQueueService.rebuildNightlyQueue(tenantId, userId);
    const entry = queue.items.find((item) => item.profileId === req.params.id && (item.status === 'pending_approval' || item.status === 'queued' || item.status === 'running'));
    return res.json({ queue, entry: entry || null });
  } catch (err: any) {
    logger.error('Error queueing profile warmup', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/:id/warmup/approve', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const entryId = req.body?.entryId;
    if (!entryId) return res.status(400).json({ error: 'entryId is required' });
    return res.json(await PredictiveWarmupQueueService.approveEntry(tenantId, entryId, req.user!.userId));
  } catch (err: any) {
    logger.error('Error approving profile warmup entry', { error: err?.message });
    res.status(500).json({ error: err?.message || 'Internal error' });
  }
});

router.post('/:id/warmup/feedback', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const entryId = req.body?.entryId;
    if (!entryId) return res.status(400).json({ error: 'entryId is required' });
    return res.json(await PredictiveWarmupQueueService.recordFeedback(tenantId, entryId, req.user!.userId, {
      outcome: req.body?.outcome || 'unchanged',
      notes: req.body?.notes,
      deltaScore: Number(req.body?.deltaScore || 0),
    }));
  } catch (err: any) {
    logger.error('Error recording profile warmup feedback', { error: err?.message });
    res.status(500).json({ error: err?.message || 'Internal error' });
  }
});

router.get('/:id/doctor-ai', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;
    const canRead = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'READ');
    if (!canRead) return res.status(403).json({ error: 'Access denied' });
    return res.json(await ProfileDoctorAiService.diagnose(req.params.id, tenantId));
  } catch (err: any) {
    logger.error('Error loading profile doctor AI', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/:id/decouple-plan', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;
    const canWrite = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'WRITE');
    if (!canWrite) return res.status(403).json({ error: 'Access denied' });
    return res.json(await ProfileDecoupleAssistantService.plan(req.params.id, tenantId));
  } catch (err: any) {
    logger.error('Error loading decouple plan', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/:id/decouple-apply', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;
    const canWrite = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'WRITE');
    if (!canWrite) return res.status(403).json({ error: 'Access denied' });
    const result = await ProfileDecoupleAssistantService.apply(req.params.id, tenantId, userId);
    await ProfileCacheService.invalidateProfile(req.params.id);
    return res.json(result);
  } catch (err: any) {
    logger.error('Error applying decouple plan', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/:id/runtime/release', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const canWrite = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'WRITE');
    if (!canWrite) return res.status(403).json({ error: 'Access denied' });

    const result = await ProfileStateService.forceReleaseRuntimeLease(req.params.id, {
      requestedBy: userId,
      tenantId,
      reason: req.body?.reason || 'manual-release',
    });

    await require('../services/audit.service').logAudit({
      tenantId,
      userId,
      action: 'profile.runtime.release',
      resource: `profile:${req.params.id}`,
      detail: result,
    });

    return res.json(result);
  } catch (err: any) {
    logger.error('Error force releasing runtime lease', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/:id/runtime/takeover', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const canWrite = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'WRITE');
    if (!canWrite) return res.status(403).json({ error: 'Access denied' });

    const result = await ProfileStateService.forceTakeoverRuntimeLease(req.params.id, userId, {
      requestedBy: userId,
      tenantId,
      reason: req.body?.reason || 'manual-takeover',
    });

    await require('../services/audit.service').logAudit({
      tenantId,
      userId,
      action: 'profile.runtime.takeover',
      resource: `profile:${req.params.id}`,
      detail: {
        previousOwner: result.previousOwner,
        nextOwner: userId,
      },
    });

    return res.json(result);
  } catch (err: any) {
    logger.error('Error taking over runtime lease', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/:id/operations', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const canRead = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'READ');
    if (!canRead) return res.status(403).json({ error: 'Access denied' });

    const operations = await BulkProfileOperationService.listByProfile(tenantId, req.params.id, 10);
    const summary = BulkProfileOperationService.summarizeForProfile(req.params.id, operations as any);
    return res.json({
      profileId: req.params.id,
      summary,
      operations,
    });
  } catch (err: any) {
    logger.error('Error loading profile operations', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/:id/snapshots', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const canRead = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'READ');
    if (!canRead) return res.status(403).json({ error: 'Access denied' });

    const snapshots = await ProfileStateService.listSnapshots(req.params.id);
    return res.json(snapshots);
  } catch (err: any) {
    logger.error('Error listing profile snapshots', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/:id/snapshots/:snapshotId/diff', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const canRead = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'READ');
    if (!canRead) return res.status(403).json({ error: 'Access denied' });

    const target = req.query.target === 'cloud' ? 'cloud' : 'live';
    const diff = await ProfileStateService.getSnapshotDiff(req.params.id, req.params.snapshotId, target);
    return res.json(diff);
  } catch (err: any) {
    logger.error('Error diffing profile snapshot', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/:id/snapshots', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const canWrite = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'WRITE');
    if (!canWrite) return res.status(403).json({ error: 'Access denied' });

    const manifest = await ProfileStateService.createSnapshot(req.params.id, 'manual', {
      requestedBy: userId,
      tenantId,
    });
    return res.status(201).json(manifest);
  } catch (err: any) {
    logger.error('Error creating profile snapshot', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/:id/restore/:snapshotId', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const canWrite = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'WRITE');
    if (!canWrite) return res.status(403).json({ error: 'Access denied' });

    const restored = await ProfileStateService.restoreSnapshot(req.params.id, req.params.snapshotId, {
      requestedBy: userId,
      tenantId,
    });
    await ProfileCacheService.invalidateProfile(req.params.id);
    return res.json(restored);
  } catch (err: any) {
    logger.error('Error restoring profile snapshot', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/:id/sync', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const canWrite = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'WRITE');
    if (!canWrite) return res.status(403).json({ error: 'Access denied' });

    const manifest = await ProfileStateService.createSnapshot(req.params.id, 'manual-sync', {
      requestedBy: userId,
      tenantId,
    });
    await ProfileStateService.uploadToCloud(req.params.id);
    const state = await ProfileStateService.getStateSummary(req.params.id);
    return res.json({ manifest, state });
  } catch (err: any) {
    logger.error('Error syncing profile state', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.post('/:id/pull', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.userId;
    const role = req.user!.role;

    const canWrite = await (AccessService as any).canAccess(userId, tenantId, role, 'profile', req.params.id, 'WRITE');
    if (!canWrite) return res.status(403).json({ error: 'Access denied' });

    const manifest = await ProfileStateService.pullFromCloud(req.params.id, {
      requestedBy: userId,
      tenantId,
    });
    const state = await ProfileStateService.getStateSummary(req.params.id);
    await ProfileCacheService.invalidateProfile(req.params.id);
    return res.json({ manifest, state });
  } catch (err: any) {
    logger.error('Error pulling profile state from cloud', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
