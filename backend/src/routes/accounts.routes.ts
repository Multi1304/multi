import { Router } from 'express';
import { prisma } from '../prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { resourceLimitMiddleware } from '../middleware/quota';
import { encryptSecret, isEncryptedSecret } from '../utils/cryptoVault';
import { AccountStateService } from '../services/accountState.service';
import { InboxVerificationService } from '../services/inboxVerification.service';
import { AccountReputationService } from '../services/accountReputation.service';

const router = Router();
router.use(authMiddleware);

// POST /accounts — Create new account for a profile
router.post('/', resourceLimitMiddleware('accounts'), async (req: AuthRequest, res) => {
  try {
    const { profileId, username, password } = req.body;
    const tenantId = req.user!.tenantId;
    if (!profileId || !username || !password) return res.status(400).json({ error: 'profileId, username, password required' });

    const profile = await prisma.profile.findUnique({ where: { id: profileId } });
    if (!profile || profile.tenantId !== tenantId) return res.status(403).json({ error: 'Invalid profile' });

    const encrypted = encryptSecret(password);

    const account = await (prisma.account as any).create({
      data: {
        profileId,
        username,
        password: encrypted,
        tenantId,
        credentialStorage: 'encrypted-vault',
        used: false,
        verified: false,
        inboxStatus: 'unknown',
        state: { source: 'manual', createdAt: new Date().toISOString() }
      },
      include: { profile: true },
    });

    const { password: _p, ...safe } = AccountStateService.normalizeAccount(account) as any;
    res.status(201).json(safe);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// List accounts by profileId (do not return password)
router.get('/', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const profileId = req.query.profileId as string | undefined;
    const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    const where: any = { tenantId };
    if (profileId && isUuid(profileId)) {
      where.profileId = profileId;
    }

    const accounts = await (prisma.account as any).findMany({
      where,
      include: { profile: true },
      orderBy: { createdAt: 'desc' }
    });

    const safe = accounts.map(a => {
      const { password, ...rest } = AccountStateService.normalizeAccount(a) as any;
      return rest;
    });

    res.json(safe);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

router.patch('/:id/state', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const updated = await AccountStateService.updateAccountState(req.params.id, tenantId, req.body || {});
    const { password, ...safe } = updated as any;
    res.json(safe);
  } catch (err: any) {
    res.status(err?.message === 'Account not found' ? 404 : 500).json({ error: err?.message || 'Internal error' });
  }
});

router.get('/verification/summary', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const summary = await InboxVerificationService.summarizeForTenant(tenantId);
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Internal error' });
  }
});

router.post('/:id/verify-sandbox', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const updated = await InboxVerificationService.recordSandboxVerification({
      tenantId,
      accountId: req.params.id,
      success: !!req.body?.success,
      mode: req.body?.mode || 'sandbox-manual',
      note: req.body?.note || null,
      inboxStatusOverride: req.body?.success ? 'verified' : 'failed',
    });
    const { password, ...safe } = updated as any;
    res.json(safe);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Internal error' });
  }
});

router.post('/:id/reputation/refresh', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const updated = await AccountReputationService.refreshScore(req.params.id, tenantId);
    const { password, ...safe } = updated as any;
    res.json(safe);
  } catch (err: any) {
    res.status(err?.message === 'Account not found' ? 404 : 500).json({ error: err?.message || 'Internal error' });
  }
});

router.post('/:id/warmup', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const result = await AccountReputationService.maybeAutoWarmup(req.params.id, tenantId);
    res.json(result || { warmed: false, reason: 'warmup_not_allowed_or_not_configured' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Internal error' });
  }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const account = await (prisma.account as any).findFirst({
      where: { id: req.params.id, tenantId }
    });
    if (!account) return res.status(404).json({ error: 'Account not found' });
    await (prisma.account as any).delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
