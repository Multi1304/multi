import crypto from 'crypto';
import { prisma } from '../prisma';

export type IncidentSeverity = 'warning' | 'high' | 'critical';
export type IncidentStatus = 'open' | 'acknowledged' | 'resolved';

export interface IncidentRecord {
  id: string;
  code: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  source: 'release_gates' | 'promotion' | 'memory' | 'sandbox' | 'queue' | 'runtime' | 'security';
  summary: string;
  evidence: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt?: string | null;
  acknowledgedBy?: string | null;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  autoResolvedAt?: string | null;
  note?: string | null;
  remediationHistory?: Array<{
    at: string;
    by: string;
    action: string;
    result: 'applied' | 'skipped' | 'failed' | 'queued';
    note?: string | null;
  }>;
  notificationHistory?: Array<{
    at: string;
    channel: 'slack' | 'teams';
    kind: 'digest' | 'critical';
    status: 'sent' | 'skipped' | 'failed';
    note?: string | null;
  }>;
}

interface IncidentRegistry {
  items: IncidentRecord[];
}

interface IncidentSignals {
  releaseGates?: { status?: string; overallScore?: number; items?: any[] } | null;
  promotionAlerts?: { critical?: number; pendingApproval?: number; blocked?: number } | null;
  memoryAdmission?: { admitted?: boolean; rssMb?: number; maxRssMb?: number } | null;
  sandboxLab?: { critical?: number; averageScore?: number } | null;
  queueDepth?: { waiting?: number; failed?: number; active?: number } | null;
  runtimeHardening?: { status?: string; overallScore?: number; recommendations?: string[] } | null;
  securityPosture?: {
    remoteExposureDetected?: boolean;
    adminAllowlistConfigured?: boolean;
    requireSensitiveMfa?: boolean;
    adminMfaCoverage?: number;
    warnings?: string[];
  } | null;
}

const MAX_INCIDENTS = 50;

export class IncidentCenterService {
  static normalizeRegistry(settings?: any): IncidentRegistry {
    const raw = settings?.incidentCenter;
    return {
      items: Array.isArray(raw?.items) ? raw.items : [],
    };
  }

  static async loadTenant(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    if (!tenant) throw new Error(`Tenant ${tenantId} not found`);
    return tenant;
  }

  static async saveRegistry(tenantId: string, tenantSettings: any, registry: IncidentRegistry) {
    const incidentCenter = tenantSettings?.incidentCenter && typeof tenantSettings.incidentCenter === 'object'
      ? tenantSettings.incidentCenter
      : {};
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...(tenantSettings || {}),
          incidentCenter: {
            ...incidentCenter,
            items: registry.items.slice(0, MAX_INCIDENTS),
          },
        } as any,
      },
    });
  }

  static async list(tenantId: string) {
    const tenant = await this.loadTenant(tenantId);
    const registry = this.normalizeRegistry(tenant.settings);
    return registry.items.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  }

  static async loadRegistry(tenantId: string) {
    const tenant = await this.loadTenant(tenantId);
    return {
      tenantSettings: tenant.settings,
      registry: this.normalizeRegistry(tenant.settings),
    };
  }

  static summarize(items: IncidentRecord[]) {
    const open = items.filter((item) => item.status === 'open');
    const acknowledged = items.filter((item) => item.status === 'acknowledged');
    const resolved = items.filter((item) => item.status === 'resolved');
    const critical = open.filter((item) => item.severity === 'critical');
    const high = open.filter((item) => item.severity === 'high');
    const warning = open.filter((item) => item.severity === 'warning');

    return {
      total: items.length,
      open: open.length,
      acknowledged: acknowledged.length,
      resolved: resolved.length,
      critical: critical.length,
      high: high.length,
      warning: warning.length,
      topOpen: open.slice(0, 5),
      topCritical: critical.slice(0, 5),
    };
  }

  static async syncFromSignals(tenantId: string, signals: IncidentSignals) {
    const tenant = await this.loadTenant(tenantId);
    const registry = this.normalizeRegistry(tenant.settings);
    const activeDefinitions = this.buildIncidentDefinitions(signals);
    const activeByCode = new Map(activeDefinitions.map((item) => [item.code, item]));
    const now = new Date().toISOString();
    let changed = false;

    for (const definition of activeDefinitions) {
      const existing = registry.items.find((item) => item.code === definition.code);
      if (!existing) {
        registry.items.unshift({
          id: crypto.randomUUID(),
          code: definition.code,
          title: definition.title,
          severity: definition.severity,
          status: 'open',
          source: definition.source,
          summary: definition.summary,
          evidence: definition.evidence,
          createdAt: now,
          updatedAt: now,
          acknowledgedAt: null,
          acknowledgedBy: null,
          resolvedAt: null,
          resolvedBy: null,
          autoResolvedAt: null,
          note: null,
          remediationHistory: [],
          notificationHistory: [],
        });
        changed = true;
        continue;
      }

      const shouldReopen = existing.status === 'resolved';
      const nextStatus: IncidentStatus = shouldReopen ? 'open' : existing.status;
      const nextCreatedAt = shouldReopen ? now : existing.createdAt;
      const nextResolvedAt = shouldReopen ? null : existing.resolvedAt ?? null;
      const nextResolvedBy = shouldReopen ? null : existing.resolvedBy ?? null;

      const mutated =
        existing.title !== definition.title ||
        existing.summary !== definition.summary ||
        existing.severity !== definition.severity ||
        JSON.stringify(existing.evidence || {}) !== JSON.stringify(definition.evidence || {}) ||
        existing.status !== nextStatus ||
        existing.createdAt !== nextCreatedAt ||
        existing.resolvedAt !== nextResolvedAt ||
        existing.resolvedBy !== nextResolvedBy ||
        existing.autoResolvedAt;

      if (mutated) {
        existing.title = definition.title;
        existing.summary = definition.summary;
        existing.severity = definition.severity;
        existing.source = definition.source;
        existing.evidence = definition.evidence;
        existing.status = nextStatus;
        existing.createdAt = nextCreatedAt;
        existing.updatedAt = now;
        existing.resolvedAt = nextResolvedAt;
        existing.resolvedBy = nextResolvedBy;
        existing.autoResolvedAt = null;
        existing.remediationHistory = Array.isArray(existing.remediationHistory) ? existing.remediationHistory : [];
        existing.notificationHistory = Array.isArray(existing.notificationHistory) ? existing.notificationHistory : [];
        changed = true;
      }
    }

    for (const item of registry.items) {
      if (activeByCode.has(item.code)) continue;
      if (item.status === 'resolved' && item.autoResolvedAt) continue;
      if (item.status !== 'resolved') {
        item.status = 'resolved';
        item.updatedAt = now;
        item.autoResolvedAt = now;
        item.resolvedAt = item.resolvedAt || now;
        item.note = item.note || 'Resolved automatically after the underlying signal recovered.';
        changed = true;
      }
    }

    if (changed) {
      await this.saveRegistry(tenantId, tenant.settings, registry);
    }
    return registry.items.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  }

  static async acknowledge(tenantId: string, incidentId: string, userId: string, note?: string | null) {
    return this.mutateIncident(tenantId, incidentId, (incident) => {
      incident.status = 'acknowledged';
      incident.acknowledgedAt = new Date().toISOString();
      incident.acknowledgedBy = userId;
      incident.updatedAt = incident.acknowledgedAt;
      incident.note = note || incident.note || null;
      incident.remediationHistory = Array.isArray(incident.remediationHistory) ? incident.remediationHistory : [];
      incident.notificationHistory = Array.isArray(incident.notificationHistory) ? incident.notificationHistory : [];
    });
  }

  static async resolve(tenantId: string, incidentId: string, userId: string, note?: string | null) {
    return this.mutateIncident(tenantId, incidentId, (incident) => {
      const now = new Date().toISOString();
      incident.status = 'resolved';
      incident.resolvedAt = now;
      incident.resolvedBy = userId;
      incident.updatedAt = now;
      incident.note = note || incident.note || null;
      incident.autoResolvedAt = null;
      incident.remediationHistory = Array.isArray(incident.remediationHistory) ? incident.remediationHistory : [];
      incident.notificationHistory = Array.isArray(incident.notificationHistory) ? incident.notificationHistory : [];
    });
  }

  static async appendRemediation(
    tenantId: string,
    incidentId: string,
    entry: {
      by: string;
      action: string;
      result: 'applied' | 'skipped' | 'failed' | 'queued';
      note?: string | null;
    }
  ) {
    return this.mutateIncident(tenantId, incidentId, (incident) => {
      incident.remediationHistory = Array.isArray(incident.remediationHistory) ? incident.remediationHistory : [];
      incident.remediationHistory.unshift({
        at: new Date().toISOString(),
        ...entry,
      });
      incident.updatedAt = new Date().toISOString();
    });
  }

  static async appendNotification(
    tenantId: string,
    incidentId: string,
    entry: {
      channel: 'slack' | 'teams';
      kind: 'digest' | 'critical';
      status: 'sent' | 'skipped' | 'failed';
      note?: string | null;
    }
  ) {
    return this.mutateIncident(tenantId, incidentId, (incident) => {
      incident.notificationHistory = Array.isArray(incident.notificationHistory) ? incident.notificationHistory : [];
      incident.notificationHistory.unshift({
        at: new Date().toISOString(),
        ...entry,
      });
      incident.updatedAt = new Date().toISOString();
    });
  }

  private static async mutateIncident(tenantId: string, incidentId: string, mutator: (incident: IncidentRecord) => void) {
    const tenant = await this.loadTenant(tenantId);
    const registry = this.normalizeRegistry(tenant.settings);
    const incident = registry.items.find((item) => item.id === incidentId);
    if (!incident) throw new Error(`Incident ${incidentId} not found`);
    mutator(incident);
    await this.saveRegistry(tenantId, tenant.settings, registry);
    return incident;
  }

  private static buildIncidentDefinitions(signals: IncidentSignals) {
    const queueWaiting = Number(signals.queueDepth?.waiting || 0);
    const queueFailed = Number(signals.queueDepth?.failed || 0);
    const sandboxCritical = Number(signals.sandboxLab?.critical || 0);
    const promotionCritical = Number(signals.promotionAlerts?.critical || 0);
    const promotionBlocked = Number(signals.promotionAlerts?.blocked || 0);
    const releaseStatus = String(signals.releaseGates?.status || '').toLowerCase();
    const runtimeStatus = String(signals.runtimeHardening?.status || '').toLowerCase();
    const adminMfaCoverage = Number(signals.securityPosture?.adminMfaCoverage || 0);
    const incidents: Array<Omit<IncidentRecord, 'id' | 'status' | 'createdAt' | 'updatedAt'>> = [];

    if (releaseStatus === 'fail') {
      incidents.push({
        code: 'release_gate_failed',
        title: 'Release gates failing',
        severity: 'critical',
        source: 'release_gates',
        summary: `Overall release gate score ${signals.releaseGates?.overallScore || 0} is below the safe threshold.`,
        evidence: {
          overallScore: signals.releaseGates?.overallScore || 0,
          failingItems: (signals.releaseGates?.items || []).filter((item: any) => item.status === 'fail').map((item: any) => item.label),
        },
        acknowledgedAt: null,
        acknowledgedBy: null,
        resolvedAt: null,
        resolvedBy: null,
        autoResolvedAt: null,
        note: null,
      });
    }

    if (promotionCritical > 0 || promotionBlocked > 0) {
      incidents.push({
        code: 'promotion_pressure',
        title: 'Promotion pipeline under pressure',
        severity: promotionCritical > 0 ? 'high' : 'warning',
        source: 'promotion',
        summary: `${promotionCritical} critical promotion alerts and ${promotionBlocked} blocked promotion tasks need attention.`,
        evidence: {
          critical: promotionCritical,
          blocked: promotionBlocked,
          pendingApproval: signals.promotionAlerts?.pendingApproval || 0,
        },
        acknowledgedAt: null,
        acknowledgedBy: null,
        resolvedAt: null,
        resolvedBy: null,
        autoResolvedAt: null,
        note: null,
      });
    }

    if (signals.memoryAdmission?.admitted === false) {
      incidents.push({
        code: 'memory_admission_blocked',
        title: 'Memory admission blocked new workloads',
        severity: 'critical',
        source: 'memory',
        summary: `Memory admission blocked at ${signals.memoryAdmission?.rssMb || 0}MB RSS.`,
        evidence: {
          admitted: false,
          rssMb: signals.memoryAdmission?.rssMb || 0,
          maxRssMb: signals.memoryAdmission?.maxRssMb || 0,
        },
        acknowledgedAt: null,
        acknowledgedBy: null,
        resolvedAt: null,
        resolvedBy: null,
        autoResolvedAt: null,
        note: null,
      });
    }

    if (sandboxCritical > 0) {
      incidents.push({
        code: 'sandbox_lab_critical',
        title: 'Sandbox compatibility regression',
        severity: sandboxCritical >= 2 ? 'critical' : 'high',
        source: 'sandbox',
        summary: `${sandboxCritical} sandbox scenarios are in a critical state.`,
        evidence: {
          critical: sandboxCritical,
          averageScore: signals.sandboxLab?.averageScore || 0,
        },
        acknowledgedAt: null,
        acknowledgedBy: null,
        resolvedAt: null,
        resolvedBy: null,
        autoResolvedAt: null,
        note: null,
      });
    }

    if (queueWaiting >= 15 || queueFailed >= 5) {
      incidents.push({
        code: 'queue_pressure',
        title: 'Queue pressure rising',
        severity: queueWaiting >= 30 || queueFailed >= 10 ? 'critical' : 'warning',
        source: 'queue',
        summary: `Queue waiting is ${queueWaiting} and failed jobs are ${queueFailed}.`,
        evidence: {
          waiting: queueWaiting,
          failed: queueFailed,
          active: signals.queueDepth?.active || 0,
        },
        acknowledgedAt: null,
        acknowledgedBy: null,
        resolvedAt: null,
        resolvedBy: null,
        autoResolvedAt: null,
        note: null,
      });
    }

    if (runtimeStatus === 'critical' || runtimeStatus === 'danger' || runtimeStatus === 'warning') {
      incidents.push({
        code: 'runtime_hardening_degraded',
        title: 'Runtime hardening degraded',
        severity: runtimeStatus === 'warning' ? 'warning' : 'high',
        source: 'runtime',
        summary: `Runtime hardening is ${runtimeStatus} with score ${signals.runtimeHardening?.overallScore || 0}.`,
        evidence: {
          status: runtimeStatus,
          overallScore: signals.runtimeHardening?.overallScore || 0,
          recommendation: signals.runtimeHardening?.recommendations?.[0] || null,
        },
        acknowledgedAt: null,
        acknowledgedBy: null,
        resolvedAt: null,
        resolvedBy: null,
        autoResolvedAt: null,
        note: null,
      });
    }

    if (signals.securityPosture?.remoteExposureDetected && !signals.securityPosture?.adminAllowlistConfigured) {
      incidents.push({
        code: 'public_surface_without_allowlist',
        title: 'Remote exposure detected without admin IP allowlist',
        severity: 'critical',
        source: 'security',
        summary: 'Camel appears reachable beyond localhost while the admin IP allowlist is not configured.',
        evidence: {
          remoteExposureDetected: true,
          adminAllowlistConfigured: false,
          warnings: signals.securityPosture?.warnings || [],
        },
        acknowledgedAt: null,
        acknowledgedBy: null,
        resolvedAt: null,
        resolvedBy: null,
        autoResolvedAt: null,
        note: null,
      });
    }

    if (adminMfaCoverage < 100) {
      incidents.push({
        code: 'low_admin_mfa_coverage',
        title: 'Admin MFA coverage is incomplete',
        severity: adminMfaCoverage === 0 ? 'high' : 'warning',
        source: 'security',
        summary: `Only ${adminMfaCoverage}% of admin users currently have MFA enabled.`,
        evidence: {
          adminMfaCoverage,
          requireSensitiveMfa: !!signals.securityPosture?.requireSensitiveMfa,
          warnings: signals.securityPosture?.warnings || [],
        },
        acknowledgedAt: null,
        acknowledgedBy: null,
        resolvedAt: null,
        resolvedBy: null,
        autoResolvedAt: null,
        note: null,
      });
    }

    return incidents;
  }
}
