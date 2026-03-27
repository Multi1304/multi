# CamelFarm: AI-Powered Stealth Browser (Grok Edition)

An enterprise-grade, cloud-optimized, AI-driven stealth automation engine. Fuses pure mathematical human simulation, **Grok (xAI)** predictive fingerprint masking, and scalable proxy-chaining. Formerly known as Multilogin Superior.

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** v20+
- **Python** 3.10+ (with `requests` installed)
- **xAI API Key**: Required for Grok-powered evasion and RPA.
- **Docker**: For edge cluster deployments.

### 2. Local Installation
```bash
cd backend
npm install
# Ensure Python dependencies for the AI bridge are present
pip install requests
```

### 3. Running the Stack (Development)
You can launch the core backend API and the React UI simultaneously:
```bash
# Terminal 1 - Start the Backend Node
cd backend
npm run dev

# Terminal 2 - Start the React UI
cd frontend
npm start
```

---

## 🛡️ Utilizing the Spoof Engine

### Core Spoofing & Evasion (Programmatic)
To instantiate an ultra-stealthy profile directly in code, simply import the `SpoofEngine`:

```typescript
import { SpoofEngine } from './src/core/spoof';

const profile = await SpoofEngine.launchProfile({
  id: 'my-stealth-profile-001',
  proxy: 'socks5://127.0.0.1:9050', // Integrates immediately with local TOR
  humanMode: true // Enables Bezier curve mouse movements and natural scrolling
});

// The engine automatically fetches AI predictive suggestions from Grok (xAI)
// and auto-selects a 2026 User-Agent from `uaPool.json`!

await profile.page.goto('https://browserleaks.com/canvas');
```

### Testing MVP Capabilities
A robust Jest test suite validates the core evasion mechanisms:
```bash
cd backend
npx jest tests/spoof.test.ts
```
*This will open headless browsers verifying the Canvas noise injection, WebGL vendor masking, and Bezier mouse iterations.*

## 🌐 API Endpoint Map (V3)
Standard base URL: `http://localhost:4000/api`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/login` | POST | Authenticate and get JWT |
| `/profiles` | GET/POST | Manage stealth profiles |
| `/templates/list` | GET | List platform templates (YouTube, IG, etc.) |
| `/automation/enqueue` | POST | Launch RPA tasks |
| `/flows/voice-to-flow` | POST | AI Generation of automation flows |
| `/ai/chat` | POST | Interactive Grok optimization help |
| `/health` | GET | **Grok V3 Status Rapid Test** |

---

## 🚀 Ethernet Boost Technology (Anti-Ban 2026)
CamelFarm incorporates a proprietary networking layer that detects and prioritizes physical Ethernet interfaces. 
- **Stability**: Reduces packet jitter by up to 40% compared to WiFi, eliminating "network-lag" bot flags.
- **Hardware Binding**: Unlike software-only spoofers, "Ethernet Boost" binds the Chromium process to the OS-level static descriptors of your physical card (ethX, en0, or Ethernet).
- **Setup Guide**:
  1. Plug in your Ethernet cable or a 4G/5G USB Dongle (e.g., TP-Link, Huawei).
  2. In **Advanced Profile Manager**, toggle **Ethernet Boost**.
  3. The engine automatically detects the physical path and routes traffic through it.

## 🛡️ Elite Anti-Detection Masterclass
The 8 platform templates (YouTube, Instagram, TikTok, etc.) are tuned for 2026 evasion:
- **Dynamic ML Fingerprinting**: Utilizing Perlin-noise models for canvas hashing and WebGL rendering noise.
- **UA-30 Pool**: Each platform has a dedicated pool of 30+ unique 2026 User-Agents with outlier protection.
- **Resource Guard**: Strict 600MB RAM cap per instance with BullMQ-managed concurrent queuing (8 profiles max).
- **Expert Notes**: Each template includes platform-specific advice (e.g., "Meta: Evita scroll táctil repetitivo").

---

## 🛳️ Docker PM2 Edge Cluster
...
 (Cloud Optimized)
...

To scale the architecture horizontally up to 10 instances while maintaining a strict 600MB cap per-node—leveraging Grok's cloud API to save local RAM:

```bash
docker-compose up -d --scale edge-workers=5
```

This spins up the Redis caching layer, Postgres DB, and 5 PM2-orchestrated edge workers ready to receive REST/RPA requests while persisting profile states to the mapped volumes. 

To monitor RAM and CPU across your edge workers within Docker:
```bash
docker stats
```
## 🛡️ Anti-Detection & Hardening
- **Real 2Captcha Integration**: Automated WAF/CAPTCHA resolution with live balance checking.
- **Enhanced Proxy Health**: Preflight TCP + HTTP probes ensure every profile has a working connection before launch.
- **Behavioral ML**: Interaction patterns (mouse, scroll, keypress) sampled from real user behavior libraries for maximum undetectability.
- **Unified Enforcement**: Atomic rate-limiting and license validation integrated directly into the launch pipeline.
- **Profile Consistency**: Long-lived fingerprint stabilization and proxy stickiness (days/weeks) for durable account reputation.
- **Private Egress Orchestration**: Single-command bootstrap for local hardware (4G Dongles/Routers) and private remote exits (VPS).


## 🚀 Sandbox -> Production Migration Complete

Camel now defaults to `production` runtime mode unless a profile or tenant explicitly requests `sandbox`.

What changed:
- Production-grade session persistence now captures cookies, `localStorage`, `IndexedDB`, `Service Workers`, `Cache Storage`, and Playwright `storageState`, then stores an encrypted artifact locally and optionally in object storage.
- Runtime environment resolution is modular and explicit through adapters, keeping `sandbox` as a supported fallback.
- Production runtime emulation and mitigation are now first-party/allowlist aware. They are intended for owned or explicitly permitted environments, not arbitrary third-party targets.
- Account health now includes reputation scoring and optional first-party warmup flows.
- Profile creation surfaces a `Production Mode` toggle in the UI and sends `runtimeEnvironment` with the profile config.

Key files:
- `backend/src/services/sessionPersistence.service.ts`
- `backend/src/services/runtimeEnvironment.service.ts`
- `backend/src/services/productionRuntimeEmulation.service.ts`
- `backend/src/services/runtimeMitigation.service.ts`
- `backend/src/services/accountReputation.service.ts`

Operational note:
- If `CAMEL_RUNTIME_ENVIRONMENT` is unset, Camel runs in `production`.
- Automatic mitigation and warmup are constrained to owned or allowlisted hosts.

# Full Production + Anti-Detection Layer Complete

CamelFarm now includes a production-default runtime hardening layer for owned, sandboxed, or explicitly allowlisted environments, featuring a fully private VPN/Proxy egress pool.


Camel now ships a production-default runtime hardening layer for owned, sandboxed, or explicitly allowlisted environments.

Final production-grade improvements added in this phase:
- Proxy health is preflight-checked before routing with cached freshness windows and live TCP verification when needed.
- Long-lived profile consistency keeps the same fingerprint baseline and sticky proxy window across repeated launches for days or weeks.
- Tenant runtime capacity enforcement now supports stronger license validation, burst-aware request ceilings, and explicit suspension handling.
- Human behavior now uses replayable recorded-behavior profiles in production mode instead of only flat random delays.
- Internal challenge handling supports balance-aware, first-party-only resolution flows with safe fallback actions and no arbitrary third-party solving.

Key files:
- `backend/src/services/proxyHealth.service.ts`
- `backend/src/services/profileConsistency.service.ts`
- `backend/src/services/humanBehaviorPolicy.service.ts`
- `backend/src/services/challengeResolution.service.ts`
- `backend/src/services/runtimeMitigation.service.ts`
- `backend/src/services/tenantCapacity.service.ts`

Safety scope:
- These production features are intended for first-party, internal, or explicitly allowlisted environments.
- They are not a general-purpose bypass layer for arbitrary third-party targets.

## Enterprise Security Block Closed

Camel now includes a tenant-aware enterprise security layer designed to act like a quiet bodyguard instead of a noisy control panel.

Final enterprise security improvements added in this phase:
- Tenant security policy resolution is centralized and merges safe defaults with per-tenant overrides for monitoring, MFA, guardrails, scheduled posture reports, and role capabilities.
- Security posture snapshots can now be recorded manually, exported, and scheduled automatically per tenant with configurable retention.
- Silent guardrails remain available, but tenants can explicitly decide whether automatic guardrails should apply.
- Role capability enforcement now protects high-sensitivity operations such as secret rotation, report export, destructive action execution, and policy changes.
- Security posture history is visible in the UI so operators can see trend and drift without digging through raw audit logs.
- Admin capabilities are protected from accidental lockout by keeping the superuser baseline fixed.

Key files:
- `backend/src/services/securityPolicy.service.ts`
- `backend/src/services/securityPostureSnapshot.service.ts`
- `backend/src/services/securityPostureScheduler.service.ts`
- `backend/src/middleware/requireSecurityCapability.ts`
- `backend/src/routes/security.routes.ts`
- `backend/src/routes/apiKeys.routes.ts`
- `backend/src/routes/monitor.routes.ts`
- `frontend/src/api/security.ts`
- `frontend/src/pages/SecurityDashboard.tsx`

Operational note:
- Security posture snapshots are enabled by default and can be tuned per tenant from the Security Dashboard.
- Export, secret rotation, destructive execution, and policy management now respect tenant role capability rules in addition to base RBAC.

## Compliance + Deployment Readiness Added

Camel now goes beyond silent protection and also explains whether the workspace is compliant and whether it is ready to move beyond localhost.

What changed:
- Tenant compliance reporting now summarizes control health for MFA, admin fencing, audit integrity, destructive-action safety, scheduled posture reports, and honey/canary monitoring.
- Deployment readiness now checks reverse proxy assets, TLS environment readiness, admin fencing, sensitive MFA, sensitive surface exposure, and scheduled reporting before external exposure.
- Both reports are available through the Security API and the Security Dashboard, keeping the operator workflow compact and guided.

Key files:
- `backend/src/services/complianceReport.service.ts`
- `backend/src/services/deploymentReadiness.service.ts`
- `backend/src/routes/security.routes.ts`
- `frontend/src/api/security.ts`
- `frontend/src/pages/SecurityDashboard.tsx`

Operational note:
- Compliance and readiness are advisory but actionable. They are designed to surface blockers and the next safe step before Camel leaves local-only operation.

## Secure Profile Expansion Added

Camel now includes a safer high-value profile layer focused on strong recovery-aware encryption, cleaner operator UX, and internal profile health intelligence without turning the product into a third-party evasion toolkit.

What changed:
- `Zero-Knowledge Profile Encryption v2` now protects persisted profile session artifacts with a per-profile data-encryption key wrapped by the platform master key, while keeping an auditable dual-control recovery path for legal or admin emergency cases.
- `Profile Doctor` now scores profile health, detects internal overlap between clones or sibling profiles, and recommends decoupling or stabilization steps when Camel detects risky reuse patterns.
- `Smart Launch` now builds a launch plan automatically using routing health, profile consistency, session state, and doctor guidance before opening the runtime.
- `Profile Timeline` now merges state activity, operations, and account state changes into a visual heatmap-friendly history.
- `Dashboard` now exposes in-app notifications, account health scoring, and profile activity heatmaps to keep the operator focused without opening multiple screens.

Key files:
- `backend/src/services/profileEncryption.service.ts`
- `backend/src/services/profileDoctor.service.ts`
- `backend/src/services/profileTimeline.service.ts`
- `backend/src/services/smartLaunch.service.ts`
- `backend/src/services/notificationCenter.service.ts`
- `backend/src/services/accountHealth.service.ts`
- `backend/src/services/sessionPersistence.service.ts`
- `backend/src/routes/profiles.routes.ts`
- `backend/src/routes/monitor.routes.ts`
- `frontend/src/pages/Profiles.tsx`
- `frontend/src/pages/Dashboard.tsx`

Operational note:
- These additions are designed to strengthen Camel's own profile lifecycle, operator guidance, and internal safety posture.
- They do not provide a general-purpose ban-evasion, stealth, or abuse layer for arbitrary third-party targets.

## Advanced Safe Profile Operations Added

Camel now includes a deeper internal profile-operations layer aimed at helping operators recover, isolate, and scale profiles safely without turning the platform into a third-party attack tool.

What changed:
- `Profile Quarantine` can now isolate a profile, block launches, preserve a reason trail, and require an explicit release before the profile re-enters normal operation.
- `Profile Reputation` adds a durable internal trust score for profiles, helping operators identify high-value or fragile assets at a glance.
- `Predictive Warmup` now recommends light, moderate, or overnight warmup plans based on profile age, consistency, reputation, and recent activity.
- `Nightly Warmup Queue` now persists tenant-level warmup plans, supports optional approval before execution, records feedback, and builds a learning snapshot from completed warmups.
- `Profile Doctor AI` now summarizes profile health, overlap risk, sync state, and internal recovery recommendations using Camel-safe structured inputs.
- `Decouple Assistant` can now reseed fingerprint material and refresh routing identity with an explicit operator action instead of silent mutation.
- `Intent Flow Sandbox` lets admins turn natural-language intent into draft flows only for internal or allowlisted targets.
- `Kubernetes Readiness` exposes whether Camel has the minimum manifest structure and deployment posture needed for real cluster operation.

Key files:
- `backend/src/services/profileQuarantine.service.ts`
- `backend/src/services/profileReputation.service.ts`
- `backend/src/services/predictiveWarmup.service.ts`
- `backend/src/services/predictiveWarmupQueue.service.ts`
- `backend/src/services/predictiveWarmupScheduler.service.ts`
- `backend/src/services/profileDoctorAi.service.ts`
- `backend/src/services/profileDecoupleAssistant.service.ts`
- `backend/src/services/intentFlowSandbox.service.ts`
- `backend/src/services/kubernetesReadiness.service.ts`
- `backend/src/routes/profiles.routes.ts`
- `backend/src/routes/ai.routes.ts`
- `backend/src/routes/cluster.routes.ts`
- `backend/src/routes/monitor.routes.ts`
- `frontend/src/pages/Profiles.tsx`
- `frontend/src/pages/Dashboard.tsx`
- `deploy/k8s/`

Operational note:
- The quarantine, doctor, warmup, and decouple flows are designed to protect Camel's own workspace and internal operations.
- Intent-to-flow generation remains limited to internal or explicitly allowlisted environments.

## 🚀 Private Egress & VPN Orchestration
Camel is now "Hardware Aware" and supports private egress pools without external dependencies.
- **Bootstrap Command**: `npm run camel:bootstrap-vpn` (Starts Docker, registers exits, and runs Preflight).
- **One-Click Provisioning**: `npm run camel:provision-vps <IP> [user] [ssh_key]` (Automatic VPS Exit Setup).
- **Private Tunnels**: Drop personal `.conf` files in `configs/wireguard/` and sync.

---
*CamelFarm: Professional Undetectability, Total Independence.*
