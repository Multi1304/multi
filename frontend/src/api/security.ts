import api from './client';

export interface SecurityOverview {
  tenantId: string;
  timeframe: string;
  riskScore: number;
  stats: {
    criticalActions: number;
    evasionFailures: number;
    activeWebhooks: number;
    totalAcls: number;
    mfaCoverage: number;
  };
  status: 'CRITICAL' | 'WARNING' | 'STABLE';
  posture?: {
    requireSensitiveMfa: boolean;
    adminIpAllowlistConfigured: boolean;
    sensitiveIpAllowlistConfigured: boolean;
  };
  securityPosture?: {
    remoteExposureDetected: boolean;
    adminAllowlistConfigured: boolean;
    sensitiveAllowlistConfigured: boolean;
    requireSensitiveMfa: boolean;
    adminMfaCoverage: number;
    apiKeys: {
      total: number;
      expiringSoon: number;
      staleKeys: number;
    };
    warnings: string[];
    summary: string;
  };
}

export interface SecurityAuditIntegrity {
  tenantId: string;
  total: number;
  valid: number;
  broken: number;
  status: 'verified' | 'degraded' | 'unverified';
  lastHash: string | null;
  exportSignature: string;
  brokenEntries: Array<{
    id: string;
    action: string;
  }>;
}

export interface SecurityDestructiveAction {
  id: string;
  tenantId: string;
  userId: string;
  action: 'flow.delete' | 'api_key.delete' | 'profile.access.revoke' | 'flow.access.revoke';
  resource: string;
  status: 'pending' | 'cancelled' | 'executed' | 'failed';
  executeAt: string;
  createdAt: string;
  executedAt?: string | null;
  payload: Record<string, any>;
  note?: string | null;
}

export interface HoneyEvent {
  ipAddress?: string | null;
  userAgent?: string | null;
  path: string;
  method: string;
  trippedAt: string;
  trapId: string;
}

export interface SecurityPostureReport {
  status: 'stable' | 'needs_attention' | 'critical';
  generatedAt: string;
  priorities: string[];
  workspaceRecommendations: string[];
  apiKeyRotationCandidates: Array<{
    id: string;
    name: string;
    prefix: string;
    reason: 'expiring_soon' | 'stale_unused' | 'canary_key';
    summary: string;
    graceMinutes: number;
  }>;
  webhookRotationCandidates: Array<{
    id: string;
    url: string;
    events: string[];
    reason: 'periodic_rotation';
    summary: string;
  }>;
  delayedDestructiveSummary: {
    total: number;
    pending: number;
    failed: number;
  };
  honeySummary: {
    count: number;
    latest: HoneyEvent | null;
  };
  auditIntegrity: SecurityAuditIntegrity;
  posture: SecurityOverview['securityPosture'];
}

export interface SecurityPostureSnapshot {
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
}

export interface ComplianceReport {
  tenantId: string;
  generatedAt: string;
  score: number;
  status: 'aligned' | 'attention' | 'non_compliant';
  controls: Array<{
    key: string;
    title: string;
    status: 'pass' | 'warn' | 'fail';
    evidence: string;
  }>;
  blockers: string[];
  recommendations: string[];
}

export interface DeploymentReadinessReport {
  tenantId: string;
  generatedAt: string;
  status: 'ready' | 'caution' | 'blocked';
  checks: Array<{
    key: string;
    title: string;
    status: 'pass' | 'warn' | 'fail';
    detail: string;
  }>;
  blockers: string[];
  warnings: string[];
  recommendations: string[];
}

export interface SecurityReport {
  overview: SecurityOverview;
  posture: SecurityOverview['securityPosture'];
  auditIntegrity: SecurityAuditIntegrity;
  destructiveActions: SecurityDestructiveAction[];
  honeyEvents: HoneyEvent[];
  postureReport: SecurityPostureReport;
  postureHistory: SecurityPostureSnapshot[];
  complianceReport: ComplianceReport;
  deploymentReadiness: DeploymentReadinessReport;
  guardrails: {
    actions: Array<{
      code: string;
      status: 'applied' | 'already_active' | 'skipped';
      note: string;
    }>;
    summary: string;
  };
}

export interface TenantSecurityPolicy {
  requireSensitiveMfa: boolean;
  enhancedMonitoring: boolean;
  autoApplyGuardrails: boolean;
  reportSchedule: {
    enabled: boolean;
    intervalHours: number;
    retainSnapshots: number;
    autoExport: boolean;
  };
  rolePolicies: Record<'ADMIN' | 'MANAGER' | 'AUDITOR' | 'OPERATOR', {
    exportReports: boolean;
    rotateSecrets: boolean;
    executeDestructiveActions: boolean;
    manageSecurityPolicy: boolean;
  }>;
}

export const getSecurityOverview = async (): Promise<SecurityOverview> => {
  const { data } = await api.get('/security/overview');
  return data;
};

export const getSecurityReport = async (): Promise<SecurityReport> => {
  const { data } = await api.get('/security/report');
  return data;
};

export const resolveDestructiveAction = async (
  id: string,
  action: 'cancel' | 'execute_now'
): Promise<SecurityDestructiveAction> => {
  const { data } = await api.post(`/monitor/destructive-actions/${id}`, { action });
  return data;
};

export const rotateApiKeyFromSecurity = async (
  id: string,
  graceMinutes?: number
): Promise<{
  replacement: {
    id: string;
    name: string;
    prefix: string;
    scopes: string[];
    expiresAt: string | null;
  };
  rawKey: string;
  retiringKeyId: string;
  graceMinutes: number;
}> => {
  const { data } = await api.post(`/keys/${id}/rotate`, {
    graceMinutes,
  });
  return data;
};

export const getTenantSecurityPolicy = async (): Promise<TenantSecurityPolicy> => {
  const { data } = await api.get('/security/policy');
  return data;
};

export const updateTenantSecurityPolicy = async (
  payload: Partial<TenantSecurityPolicy>
): Promise<TenantSecurityPolicy> => {
  const { data } = await api.post('/security/policy', payload);
  return data;
};

export const rotateWebhookSecretFromSecurity = async (
  id: string
): Promise<{
  webhook: {
    id: string;
    url: string;
    events: string[];
    active: boolean;
  };
  secret: string;
  rotatedBy: string;
  rotatedAt: string;
}> => {
  const { data } = await api.post(`/security/rotate/webhook/${id}`, {});
  return data;
};

export const exportSecurityReport = async (): Promise<{
  exportType: string;
  exportedAt: string;
  tenantId: string;
  signature: string;
  snapshot: SecurityPostureSnapshot;
  report: SecurityPostureReport;
  complianceReport: ComplianceReport;
  deploymentReadiness: DeploymentReadinessReport;
}> => {
  const { data } = await api.get('/security/report/export');
  return data;
};

export const getSecurityPostureHistory = async (limit = 12): Promise<{ history: SecurityPostureSnapshot[] }> => {
  const { data } = await api.get('/security/posture-history', { params: { limit } });
  return data;
};

export const recordSecurityPostureSnapshot = async (): Promise<SecurityPostureSnapshot> => {
  const { data } = await api.post('/security/posture-snapshot', {});
  return data;
};

export const getComplianceReport = async (): Promise<ComplianceReport> => {
  const { data } = await api.get('/security/compliance-report');
  return data;
};

export const getDeploymentReadiness = async (): Promise<DeploymentReadinessReport> => {
  const { data } = await api.get('/security/deployment-readiness');
  return data;
};
