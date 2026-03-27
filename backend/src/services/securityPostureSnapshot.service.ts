import crypto from 'crypto';
import { prisma } from '../prisma';
import { SecurityPostureReportService } from './securityPostureReport.service';
import { SecurityPolicyService } from './securityPolicy.service';

export type SecurityPostureSnapshot = {
  id: string;
  generatedAt: string;
  reason: 'scheduled' | 'manual' | 'export';
  status: 'stable' | 'needs_attention' | 'critical';
  remoteExposureDetected: boolean;
  brokenAuditEntries: number;
  honeyEvents: number;
  pendingDestructiveActions: number;
  priorities: string[];
  summary: string;
  exportSignature: string;
};

export class SecurityPostureSnapshotService {
  static async getHistory(tenantId: string, limit = 10): Promise<SecurityPostureSnapshot[]> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = tenant?.settings && typeof tenant.settings === 'object'
      ? (tenant.settings as Record<string, any>)
      : {};
    const snapshots = Array.isArray(settings.securityPostureSnapshots)
      ? settings.securityPostureSnapshots
      : [];
    return snapshots.slice(0, Math.max(1, limit));
  }

  static async recordSnapshot(
    tenantId: string,
    reason: 'scheduled' | 'manual' | 'export' = 'manual'
  ): Promise<SecurityPostureSnapshot> {
    const [tenant, report, policy] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { settings: true },
      }),
      SecurityPostureReportService.build(tenantId),
      SecurityPolicyService.getPolicy(tenantId),
    ]);

    const settings = tenant?.settings && typeof tenant.settings === 'object'
      ? { ...(tenant.settings as Record<string, any>) }
      : {};
    const previous = Array.isArray(settings.securityPostureSnapshots)
      ? [...settings.securityPostureSnapshots]
      : [];

    const snapshot: SecurityPostureSnapshot = {
      id: `secsnap_${crypto.randomBytes(6).toString('hex')}`,
      generatedAt: report.generatedAt,
      reason,
      status: report.status as SecurityPostureSnapshot['status'],
      remoteExposureDetected: Boolean(report.posture?.remoteExposureDetected),
      brokenAuditEntries: report.auditIntegrity.broken,
      honeyEvents: report.honeySummary.count,
      pendingDestructiveActions: report.delayedDestructiveSummary.pending,
      priorities: report.priorities.slice(0, 4),
      summary: report.workspaceRecommendations[0] || 'No additional workspace recommendation.',
      exportSignature: report.auditIntegrity.exportSignature,
    };

    const nextSnapshots = [snapshot, ...previous].slice(0, policy.reportSchedule.retainSnapshots);

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...settings,
          securityPostureSnapshots: nextSnapshots,
          securityPostureLastSnapshotAt: snapshot.generatedAt,
        } as any,
      },
    });

    return snapshot;
  }
}
