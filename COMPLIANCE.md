# Multilogin Platform - Compliance & Security Operations

This document describes the operational procedures and compliance mechanisms built into the platform (Phase 5 of the Commercial V1 release).

## 1. Feature Flags

Feature flags allow granular control over feature availability on a per-tenant or global basis.

**Available Flags:**
- `platform.enabled` (Global): The ultimate kill switch. If set to `false`, the entire platform enters maintenance mode, rejecting all API traffic except Superadmin tasks and health checks.
- `feature.bulk.enabled` (Tenant/Global): Toggles access to Bulk Provisioning tools and API routes (`/bulk/*`).
- `feature.liveops.enabled` (Tenant/Global): Toggles access to Live Operations and Monitoring via SSE (`/monitor/*`).
- `feature.tasks.enabled` (Tenant/Global): Toggles access to Task Builder and batch processing capabilities (`/tasks/*`).

**Query Scope Priority:**
When evaluating feature flags, the system checks tenant-specific overrides first. If no tenant flag exists, it falls back to the global (`tenantId: null`) flag.

## 2. Tenant Suspension

Superadmins can immediately revoke platform access for any tenant (workspace) due to AUP violations, unpaid invoices, or abuse.

**How to Suspend a Tenant:**
1. Navigate to the Admin Panel (`/admin`).
2. Locate the workspace in the Tenant list.
3. Click "Suspend Tenant" or issue a `POST /admin/tenants/:id/suspend` request.

**Impact of Suspension:**
- All active sessions are immediately invalidated at the middleware layer (`tenantSuspensionMiddleware`).
- API requests returning data or executing jobs for that tenant will return `403 Forbidden`.
- Workers checking out jobs for suspended tenants are paused.

## 3. Global Kill Switch

In the event of a catastrophic global security vulnerability or a massive abuse campaign, the Superadmin can hit the Global Kill Switch.

**How to trigger:**
Execute an upsert on the `platform.enabled` feature flag with `tenantId: null` and `enabled: false`.

**Impact:**
- The `killSwitchMiddleware` blocks all requests universally with a `503 Service Unavailable`.
- Only `/health` and `/admin/*` routes remain open so Superadmins can remediate the issue and reverse the flag.

## 4. Audit Log Interpretation (Incident Response)

Every critical or security-oriented action creates an immutable log in the `AuditLog` table.
To investigate an incident, view the Audit Log Viewer (`/audit`).

Look for the following primary mitigation actions when tracing abuse:
- `tenant.suspend.toggle`: Shows when and who suspended or re-activated a workspace.
- `feature_flag.change`: Shows changes to system configuration limits. 
- `task.batch.create`: Traces execution flows if a user deployed large-scale automation spam.
- `bulk.profiles.clone`: Highlights potentially abusive resource consumption.

If limits are exceeded, search your standard Application Logs for the `limit exceeded` tag, which is emitted directly by the `dailyActionLimitMiddleware` before traffic drops.
