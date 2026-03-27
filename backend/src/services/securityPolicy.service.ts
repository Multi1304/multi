import { prisma } from '../prisma';
import { config } from '../config';

export type SecurityCapability =
  | 'exportReports'
  | 'rotateSecrets'
  | 'executeDestructiveActions'
  | 'manageSecurityPolicy';

export type TenantRole = 'ADMIN' | 'MANAGER' | 'AUDITOR' | 'OPERATOR';

export type RoleSecurityPolicy = Record<SecurityCapability, boolean>;

export type TenantSecurityPolicy = {
  requireSensitiveMfa: boolean;
  enhancedMonitoring: boolean;
  autoApplyGuardrails: boolean;
  reportSchedule: {
    enabled: boolean;
    intervalHours: number;
    retainSnapshots: number;
    autoExport: boolean;
  };
  rolePolicies: Record<TenantRole, RoleSecurityPolicy>;
};

const DEFAULT_ROLE_POLICIES: Record<TenantRole, RoleSecurityPolicy> = {
  ADMIN: {
    exportReports: true,
    rotateSecrets: true,
    executeDestructiveActions: true,
    manageSecurityPolicy: true,
  },
  MANAGER: {
    exportReports: true,
    rotateSecrets: true,
    executeDestructiveActions: true,
    manageSecurityPolicy: false,
  },
  AUDITOR: {
    exportReports: true,
    rotateSecrets: false,
    executeDestructiveActions: false,
    manageSecurityPolicy: false,
  },
  OPERATOR: {
    exportReports: false,
    rotateSecrets: false,
    executeDestructiveActions: false,
    manageSecurityPolicy: false,
  },
};

const DEFAULT_REPORT_SCHEDULE = {
  enabled: true,
  intervalHours: 24,
  retainSnapshots: 14,
  autoExport: false,
};

export class SecurityPolicyService {
  static mergePolicy(rawPolicy: any): TenantSecurityPolicy {
    const policy = rawPolicy && typeof rawPolicy === 'object'
      ? { ...rawPolicy }
      : {};

    const rawRolePolicies = policy.rolePolicies && typeof policy.rolePolicies === 'object'
      ? policy.rolePolicies
      : {};
    const rawReportSchedule = policy.reportSchedule && typeof policy.reportSchedule === 'object'
      ? policy.reportSchedule
      : {};

    const rolePolicies = (['ADMIN', 'MANAGER', 'AUDITOR', 'OPERATOR'] as TenantRole[]).reduce((acc, role) => {
      const overrides = rawRolePolicies[role] && typeof rawRolePolicies[role] === 'object'
        ? rawRolePolicies[role]
        : {};
      acc[role] = {
        ...DEFAULT_ROLE_POLICIES[role],
        ...overrides,
      };
      return acc;
    }, {} as Record<TenantRole, RoleSecurityPolicy>);

    rolePolicies.ADMIN = {
      ...DEFAULT_ROLE_POLICIES.ADMIN,
    };

    return {
      requireSensitiveMfa: Boolean(policy.requireSensitiveMfa ?? config.security.requireSensitiveMfa),
      enhancedMonitoring: Boolean(policy.enhancedMonitoring ?? false),
      autoApplyGuardrails: policy.autoApplyGuardrails !== false,
      reportSchedule: {
        enabled: rawReportSchedule.enabled !== false,
        intervalHours: Math.min(168, Math.max(1, Number(rawReportSchedule.intervalHours || DEFAULT_REPORT_SCHEDULE.intervalHours))),
        retainSnapshots: Math.min(90, Math.max(3, Number(rawReportSchedule.retainSnapshots || DEFAULT_REPORT_SCHEDULE.retainSnapshots))),
        autoExport: Boolean(rawReportSchedule.autoExport ?? DEFAULT_REPORT_SCHEDULE.autoExport),
      },
      rolePolicies,
    };
  }

  static async getPolicy(tenantId: string): Promise<TenantSecurityPolicy> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = tenant?.settings && typeof tenant.settings === 'object'
      ? (tenant.settings as Record<string, any>)
      : {};
    return this.mergePolicy(settings.securityPolicy);
  }

  static async isCapabilityAllowed(tenantId: string, role: string, capability: SecurityCapability) {
    const policy = await this.getPolicy(tenantId);
    const normalizedRole = (['ADMIN', 'MANAGER', 'AUDITOR', 'OPERATOR'].includes(role)
      ? role
      : 'OPERATOR') as TenantRole;
    return Boolean(policy.rolePolicies[normalizedRole]?.[capability]);
  }
}
