# Multilogin Platform — Ultra Deluxe

Enterprise-grade multi-tenant browser automation platform. Comparable to AdsPower, GoLogin, Multilogin Pro — with superior scalability and extensibility.

## Architecture

```
┌──────────────┐     ┌──────────┐     ┌────────────┐
│   Express    │────▶│  Redis   │────▶│  Worker(s) │
│   API :4000  │     │  BullMQ  │     │  Playwright│
└──────┬───────┘     └──────────┘     └──────┬─────┘
       │                                      │
       ▼                                      ▼
┌──────────────┐                    ┌──────────────┐
│  PostgreSQL  │                    │  Browser     │
│  (Prisma)    │                    │  Profiles    │
└──────────────┘                    └──────────────┘
```

**Stack**: Node.js, TypeScript, Express, BullMQ, Playwright, Prisma, PostgreSQL, Redis, Stripe.

## Quick Start

### 1. Prerequisites
- Docker & Docker Compose
- Node.js 18+

### 2. Start the stack

```bash
cd backend
cp .env.example .env     # Edit JWT_SECRET, ENCRYPTION_KEY, Stripe keys (optional)
docker compose up --build
```

This starts: PostgreSQL, Redis, API (port 4000), Worker.

### 3. Run database migration

```bash
docker compose exec api npx prisma migrate deploy
```

### 4. Seed initial data

```bash
docker compose exec api node setup.js
```

This creates a dev tenant, admin user (`admin@local` / `AdminPass123!`), a default profile, and a test account.

### 5. Generate a JWT token

```bash
# Login
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@local","password":"AdminPass123!"}'
```

Copy the `token` from the response. Use it as `Authorization: Bearer <token>` in all subsequent requests.

### 6. Or register a new tenant

```bash
curl -X POST http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"tenantName":"My Company","email":"me@example.com","password":"SecurePassword123!"}'
```

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register tenant + admin user |
| POST | `/auth/login` | Login, get JWT |
| POST | `/auth/invite` | Invite user to tenant (ADMIN/MANAGER) |

### Profiles
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/profiles` | List profiles |
| GET | `/profiles/:id` | Get profile with accounts |
| POST | `/profiles` | Create profile (auto-generates fingerprint) |
| POST | `/profiles/:id/clone` | Clone profile |
| GET | `/profiles/:id/fingerprint` | Get fingerprint |
| PUT | `/profiles/:id/fingerprint` | Update fingerprint |
| PUT | `/profiles/:id/proxy` | Update proxy config |
| PUT | `/profiles/:id/network` | Update DNS/WebRTC/timezone/locale/geo |
| DELETE | `/profiles/:id` | Delete profile |

### Accounts
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/accounts` | Create account |
| GET | `/accounts?profileId=...` | List accounts by profile |

### Automation
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/automation/enqueue` | Enqueue a job |
| GET | `/automation/jobs` | List jobs (paginated, filterable) |
| GET | `/automation/jobs/:id` | Get job status |
| GET | `/automation/queue-stats` | Queue statistics |

### Billing
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/billing` | Tenant billing info + plan limits |
| GET | `/billing/usage` | Current quota usage |
| POST | `/billing/checkout` | Create Stripe checkout (ADMIN) |
| POST | `/billing/portal` | Create billing portal (ADMIN) |
| POST | `/billing/plan` | Manual plan change (dev/testing, ADMIN) |
| POST | `/billing/webhook` | Stripe webhook (automated) |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/dashboard` | System overview |
| GET | `/admin/metrics` | Job metrics (24h) |

### Workers
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/workers/register` | Register external worker (ADMIN) |
| POST | `/workers/heartbeat` | Worker heartbeat |
| GET | `/workers` | List workers |
| DELETE | `/workers/:id` | Deregister worker (ADMIN) |

### Audit
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/audit` | Query audit log (ADMIN/AUDITOR) |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | API status |
| GET | `/health` | Health check with uptime |

## Enqueue a Job

```bash
curl -X POST http://localhost:4000/automation/enqueue \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "<account-id>",
    "jobType": "login_check",
    "payload": {
      "url": "https://example.com/login"
    }
  }'
```

**Supported job types:**
- `login_check` — Check if an account is logged in to a URL
- `browser_action` — Execute browser actions (click, fill, screenshot, custom scripts)
- `scrape` — Extract data from pages using CSS selectors
- `session_maintenance` — Keep sessions alive by visiting warm-up URLs

## Configure Proxy & Fingerprint

```bash
# Set proxy for a profile
curl -X PUT http://localhost:4000/profiles/<id>/proxy \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"type":"http","host":"proxy.example.com","port":8080,"username":"user","password":"pass"}'

# Set network config
curl -X PUT http://localhost:4000/profiles/<id>/network \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "timezone": "America/New_York",
    "locale": "en-US",
    "webrtc": "disabled",
    "geolocation": {"latitude":40.7128,"longitude":-74.0060,"accuracy":100},
    "dnsConfig": {"servers":["8.8.8.8","1.1.1.1"]}
  }'
```

## Stripe Integration

1. Set env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, etc.
2. Create prices in Stripe Dashboard for pro/enterprise/ultra plans.
3. Set up webhook in Stripe to point to `POST https://your-domain.com/billing/webhook`.
4. Events handled: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.

## Plans & Quotas

| Feature | Free | Pro | Enterprise | Ultra |
|---------|------|-----|-----------|-------|
| Profiles | 3 | 50 | 500 | ∞ |
| Accounts | 5 | 200 | 5,000 | ∞ |
| Seats | 1 | 5 | 50 | ∞ |
| Jobs/min | 5 | 30 | 100 | ∞ |
| Jobs/hr | 50 | 500 | 3,000 | ∞ |
| Jobs/day | 200 | 5,000 | 50,000 | ∞ |

## Roles

| Role | Permissions |
|------|------------|
| ADMIN | Full access, manage users/billing/workers |
| MANAGER | Invite users, manage profiles |
| OPERATOR | Create profiles, enqueue jobs |
| AUDITOR | Read audit logs |
| USER | Basic access |

## Queue Dashboard

BullBoard job monitoring available at: `http://localhost:4000/admin/queues`

## Scaling Workers

```bash
# Add more workers via docker-compose
docker compose up --build --scale worker=3
```

Each worker processes jobs concurrently (default 5, configurable via `WORKER_CONCURRENCY`).

## Project Structure

```
backend/
├── prisma/schema.prisma          # Database models
├── src/
│   ├── config/                   # Centralized configuration
│   │   ├── index.ts              # Env var reader
│   │   └── plans.ts              # Plan quota definitions
│   ├── middleware/                # Express middleware
│   │   ├── auth.ts               # JWT auth + RBAC
│   │   └── quota.ts              # Rate limiting
│   ├── routes/                   # API endpoints
│   │   ├── auth.ts               # Register/login/invite
│   │   ├── profiles.routes.ts    # Profile CRUD + fingerprint/proxy
│   │   ├── accounts.routes.ts    # Account management
│   │   ├── automation.routes.ts  # Job enqueue + status
│   │   ├── billing.routes.ts     # Stripe + usage
│   │   ├── admin.routes.ts       # Dashboard + metrics
│   │   ├── workers.routes.ts     # Worker management
│   │   └── audit.routes.ts       # Audit log query
│   ├── adapters/                 # External service adapters
│   │   ├── playwright.adapter.ts # Browser automation
│   │   └── fingerprint.ts        # Fingerprint generation
│   ├── jobs/                     # Job handlers
│   │   ├── index.ts              # Handler registry
│   │   ├── login-check.job.ts    # Login validation
│   │   ├── browser-action.job.ts # Generic browser actions
│   │   ├── scrape.job.ts         # Data extraction
│   │   └── session-maintenance.job.ts
│   ├── services/                 # Business logic
│   │   ├── stripe.service.ts     # Stripe integration
│   │   └── audit.service.ts      # Audit logging
│   ├── queues/
│   │   └── automation.queue.ts   # BullMQ queue
│   ├── workers/
│   │   └── automation.worker.ts  # BullMQ worker
│   ├── monitor/
│   │   └── bullboard.ts          # Queue dashboard
│   ├── utils/
│   │   ├── auth.ts               # JWT/bcrypt helpers
│   │   ├── logger.ts             # Structured logging
│   │   └── encryption.ts         # AES-256-GCM
│   ├── prisma.ts                 # Prisma client singleton
│   └── server.ts                 # Express app entry point
├── docker-compose.yml
├── Dockerfile
├── .env.example
└── package.json
```
