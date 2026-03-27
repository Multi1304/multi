import { Router } from 'express';
import { prisma } from '../prisma';
import { authMiddleware, AuthRequest, requireRole } from '../middleware/auth';
import { logger } from '../utils/logger';
import { normalizeAuditRecord, summarizeAuditActions } from '../services/audit.service';
import { AuditIntegrityService } from '../services/auditIntegrity.service';

const router = Router();
router.use(authMiddleware);

router.get('/summary', requireRole('ADMIN', 'AUDITOR'), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const recent = await prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { user: { select: { email: true, role: true } } },
    });

    const normalized = recent.map((record) => normalizeAuditRecord(record));
    const topActions = summarizeAuditActions(normalized);
    const topResources = normalized.reduce((acc: Record<string, number>, item: any) => {
      const key = item.resourceType || 'other';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return res.json({
      total: normalized.length,
      topActions,
      topResources: Object.entries(topResources)
        .map(([resourceType, count]) => ({ resourceType, count }))
        .sort((a, b) => Number(b.count) - Number(a.count))
        .slice(0, 8),
      recent: normalized.slice(0, 10),
    });
  } catch (err: any) {
    logger.error('Error summarizing audit log', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

// GET /audit — Query audit log (ADMIN / AUDITOR only)
router.get('/', requireRole('ADMIN', 'AUDITOR'), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const action = req.query.action as string | undefined;
    const userId = req.query.userId as string | undefined;
    const resource = req.query.resource as string | undefined;

    const where: any = { tenantId };
    if (action) where.action = { contains: action };
    if (userId) where.userId = userId;
    if (resource) where.resource = { contains: resource };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { email: true, role: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return res.json({
      data: logs.map((record) => normalizeAuditRecord(record)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err: any) {
    logger.error('Error querying audit log', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

router.get('/evidence', requireRole('ADMIN', 'AUDITOR'), async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const verification = await AuditIntegrityService.verifyTenant(tenantId, Math.min(500, Number(req.query.limit) || 200));
    return res.json(verification);
  } catch (err: any) {
    logger.error('Error exporting audit evidence', { error: err?.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

export default router;
