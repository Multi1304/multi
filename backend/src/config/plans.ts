export interface PlanLimits {
  maxProfiles: number;   // -1 = unlimited
  maxAccounts: number;
  maxSeats: number;
  jobsPerMinute: number;
  jobsPerHour: number;
  jobsPerDay: number;
  maxBulkOperationsPerDay: number;
  maxTaskBatchesPerDay: number;
}

const UNLIMITED = -1;

export const PLANS: Record<string, PlanLimits> = {
  free: {
    maxProfiles: UNLIMITED,
    maxAccounts: UNLIMITED,
    maxSeats: UNLIMITED,
    jobsPerMinute: 5,
    jobsPerHour: 50,
    jobsPerDay: 200,
    maxBulkOperationsPerDay: 1,
    maxTaskBatchesPerDay: 1,
  },
  pro: {
    maxProfiles: UNLIMITED,
    maxAccounts: UNLIMITED,
    maxSeats: UNLIMITED,
    jobsPerMinute: 30,
    jobsPerHour: 500,
    jobsPerDay: 5000,
    maxBulkOperationsPerDay: 10,
    maxTaskBatchesPerDay: 10,
  },
  enterprise: {
    maxProfiles: UNLIMITED,
    maxAccounts: UNLIMITED,
    maxSeats: UNLIMITED,
    jobsPerMinute: 100,
    jobsPerHour: 3000,
    jobsPerDay: 50000,
    maxBulkOperationsPerDay: 50,
    maxTaskBatchesPerDay: 100,
  },
  ultra: {
    maxProfiles: UNLIMITED,
    maxAccounts: UNLIMITED,
    maxSeats: UNLIMITED,
    jobsPerMinute: UNLIMITED,
    jobsPerHour: UNLIMITED,
    jobsPerDay: UNLIMITED,
    maxBulkOperationsPerDay: UNLIMITED,
    maxTaskBatchesPerDay: UNLIMITED,
  },
};

export function getPlanLimits(plan: string): PlanLimits {
  return PLANS[plan] || PLANS.free;
}

export function isUnlimitedLimit(limit?: number | null) {
  return typeof limit === 'number' && limit < 0;
}

export function resolveEffectiveSeatAllowance(plan: string, tenantSeatsAllowed?: number | null) {
  const planLimit = getPlanLimits(plan).maxSeats;
  if (isUnlimitedLimit(planLimit) || isUnlimitedLimit(tenantSeatsAllowed)) {
    return UNLIMITED;
  }
  if (typeof tenantSeatsAllowed === 'number' && tenantSeatsAllowed > 0) {
    return typeof planLimit === 'number' && planLimit > 0
      ? Math.min(planLimit, tenantSeatsAllowed)
      : tenantSeatsAllowed;
  }
  return planLimit;
}
