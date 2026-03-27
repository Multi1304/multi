import express, { Router } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import fs from 'fs/promises';
import net from 'net';
import path from 'path';

import authRoutes from './routes/auth';
import profilesRoutes from './routes/profiles.routes';
import accountsRoutes from './routes/accounts.routes';
import automationRoutes from './routes/automation.routes';
import billingRoutes from './routes/billing.routes';
import auditRoutes from './routes/audit.routes';
import workersRoutes from './routes/workers.routes';
import teamRoutes from './routes/team.routes';
import bulkRoutes from './routes/bulk.routes';
import monitorRoutes from './routes/monitor.routes';
import { tasksRouter } from './routes/tasks.routes';
import { adminRouter } from './routes/admin.routes';
import { networkRouter } from './routes/network.routes';
import flowsRoutes from './routes/flows.routes';
import apiKeysRoutes from './routes/apiKeys.routes';
import securityRoutes from './routes/security.routes';
import clusterRoutes from './routes/cluster.routes';
import aiRoutes from './routes/ai.routes';
import templatesRoutes from './routes/templates.routes';

import { mountBullBoard } from './monitor/bullboard';
import { QueueService } from './services/queue.service';
import { ReleaseGateSchedulerService } from './services/releaseGateScheduler.service';
import { SoakTestSchedulerService } from './services/soakTestScheduler.service';
import { BenchmarkSeriesSchedulerService } from './services/benchmarkSeriesScheduler.service';
import { PredictiveWarmupSchedulerService } from './services/predictiveWarmupScheduler.service';
import { WeeklyComparativeReportSchedulerService } from './services/weeklyComparativeReportScheduler.service';
import { IncidentSchedulerService } from './services/incidentScheduler.service';
import { NetworkHealthSchedulerService } from './services/networkHealthScheduler.service';
import { DestructiveActionSchedulerService } from './services/destructiveActionScheduler.service';
import { SecurityPostureSchedulerService } from './services/securityPostureScheduler.service';
import { MaintenanceService } from './services/maintenance.service';
import { config, validateConfig } from './config';
import { logger } from './utils/logger';
import { generalLimiter } from './middleware/rateLimiter';
import { requestIdMiddleware } from './middleware/requestId';
import { authMiddleware, unifiedAuth } from './middleware/auth';
import swaggerUi from 'swagger-ui-express';
import { killSwitchMiddleware } from './middleware/killswitch';
import { tenantSuspensionMiddleware } from './middleware/tenant';
import { requireFeatureFlag } from './middleware/featureFlag';
import { sensitiveSurfaceGuard } from './middleware/sensitiveSurface';
import { ipAllowlistGuard } from './middleware/ipAllowlist';

import { SpoofEngine } from './core/spoof';
import { CanaryTrapService } from './services/canaryTrap.service';

// ─── Startup Validation & Initialization ──────────────────────────
const isTestRuntime = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
const runtimeServicesEnabled = process.env.CAMEL_ENABLE_RUNTIME_SERVICES === 'true' || !isTestRuntime;

validateConfig();

function initializeRuntimeServices() {
  QueueService.init();
  SpoofEngine.initAutoScaling();
  SpoofEngine.startWorker();
  ReleaseGateSchedulerService.start();
  SoakTestSchedulerService.start();
  BenchmarkSeriesSchedulerService.start();
  PredictiveWarmupSchedulerService.start();
  WeeklyComparativeReportSchedulerService.start();
  IncidentSchedulerService.start();
  NetworkHealthSchedulerService.start();
  DestructiveActionSchedulerService.start();
  SecurityPostureSchedulerService.start();
  MaintenanceService.startScheduler();
}

if (runtimeServicesEnabled) {
  initializeRuntimeServices();
} else {
  logger.info('Skipping heavy runtime services for test/lightweight execution', {
    nodeEnv: process.env.NODE_ENV || 'development',
    vitest: process.env.VITEST || 'false',
  });
}

export const app = express();

async function isPortAvailable(port: number) {
  return await new Promise<boolean>((resolve) => {
    const tester = net.createServer();

    tester.once('error', (error: any) => {
      if (error?.code === 'EADDRINUSE' || error?.code === 'EACCES') {
        resolve(false);
        return;
      }
      resolve(false);
    });

    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });

    tester.listen(port, '0.0.0.0');
  });
}

async function findAvailablePort(preferredPort: number, attempts = 15) {
  for (let offset = 0; offset < attempts; offset += 1) {
    const candidate = preferredPort + offset;
    if (await isPortAvailable(candidate)) {
      return candidate;
    }
  }

  throw new Error(`No available port found starting at ${preferredPort}`);
}

async function publishDevPort(port: number) {
  if (process.env.NODE_ENV === 'test') return;

  const payload = JSON.stringify({
    port,
    updatedAt: new Date().toISOString()
  }, null, 2);

  const target = path.resolve(__dirname, '../../frontend/public/dev-api-port.json');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, payload, 'utf8');
}

// ─── Middleware ────────────────────────────────────────────────────

// Trust proxy for rate limiting (Caddy/Nginx)
app.set('trust proxy', config.trustedProxyHops);

// Request ID for log correlation
app.use(requestIdMiddleware);

// CORS — strict whitelist
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost', 'http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow supertest/curl (no-origin) or explicit matching environments
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV === 'test') {
      callback(null, true);
    } else {
      logger.warn('CORS blocked request', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// Parse HttpOnly cookies
app.use(cookieParser());

// Silent browser-side hardening with sane defaults.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// General rate limiter
app.use(generalLimiter);

// Raw body for Stripe webhook (must come before express.json)
app.use('/billing/webhook', express.raw({ type: 'application/json' }), (req: any, _res, next) => {
  req.rawBody = req.body;
  next();
});

// Parse JSON bodies for all other routes
app.use(express.json());

// Kill switch covers entire platform dynamically mapped inside the engine DB
app.use(killSwitchMiddleware);

// Request logging middleware (Structured Logs Phase 4.7)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const reqId = (req as any).requestId;
    const user = (req as any).user;

    // Skip logging basic health checks to avoid noise
    if (req.originalUrl === '/health') return;

    logger.info(`HTTP ${req.method} ${req.originalUrl}`, {
      reqId,
      endpoint: req.originalUrl,
      method: req.method,
      status: res.statusCode,
      durationMs: duration,
      tenantId: user?.tenantId || 'anonymous',
      userId: user?.userId || 'anonymous'
    });
  });
  next();
});

// Create aggregate auth middleware ensuring clean tenant suspension checks
const protectedRoute = [unifiedAuth, tenantSuspensionMiddleware];

// ─── Routes ───────────────────────────────────────────────────────
const apiRouter = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/profiles', protectedRoute, profilesRoutes);
apiRouter.use('/accounts', protectedRoute, accountsRoutes);
apiRouter.use('/automation', automationRoutes);
apiRouter.use('/billing', billingRoutes);
apiRouter.use('/admin', protectedRoute, adminRouter);
apiRouter.use('/audit', auditRoutes);
apiRouter.use('/workers', workersRoutes);
apiRouter.use('/team', teamRoutes);
apiRouter.use('/keys', protectedRoute, apiKeysRoutes);
apiRouter.use('/bulk', protectedRoute, requireFeatureFlag('feature.bulk.enabled'), bulkRoutes);
apiRouter.use('/monitor', protectedRoute, requireFeatureFlag('feature.liveops.enabled'), monitorRoutes);
apiRouter.use('/tasks', protectedRoute, requireFeatureFlag('feature.tasks.enabled'), tasksRouter);
apiRouter.use('/network', protectedRoute, requireFeatureFlag('feature.network.enterprise.enabled'), networkRouter);
apiRouter.use('/flows', protectedRoute, requireFeatureFlag('feature.flows.enabled'), flowsRoutes);
apiRouter.use('/security', protectedRoute, securityRoutes);
apiRouter.use('/cluster', protectedRoute, clusterRoutes);
apiRouter.use('/ai', protectedRoute, aiRoutes);
apiRouter.use('/templates', protectedRoute, templatesRoutes);

// Specialized Grok Health
apiRouter.get('/health', (_req, res) => res.json({ status: "ok", ai: "Grok", version: "V3" }));

// Mount standard API
app.use('/api', apiRouter);

// Legacy route compatibility for internal tests and older clients.
// We intentionally omit /health here so the root health endpoint keeps its richer payload.
const legacyRouter = Router();
legacyRouter.use('/auth', authRoutes);
legacyRouter.use('/profiles', protectedRoute, profilesRoutes);
legacyRouter.use('/accounts', protectedRoute, accountsRoutes);
legacyRouter.use('/automation', automationRoutes);
legacyRouter.use('/billing', billingRoutes);
legacyRouter.use('/admin', protectedRoute, adminRouter);
legacyRouter.use('/audit', auditRoutes);
legacyRouter.use('/workers', workersRoutes);
legacyRouter.use('/team', teamRoutes);
legacyRouter.use('/keys', protectedRoute, apiKeysRoutes);
legacyRouter.use('/bulk', protectedRoute, requireFeatureFlag('feature.bulk.enabled'), bulkRoutes);
legacyRouter.use('/monitor', protectedRoute, requireFeatureFlag('feature.liveops.enabled'), monitorRoutes);
legacyRouter.use('/tasks', protectedRoute, requireFeatureFlag('feature.tasks.enabled'), tasksRouter);
legacyRouter.use('/network', protectedRoute, requireFeatureFlag('feature.network.enterprise.enabled'), networkRouter);
legacyRouter.use('/flows', protectedRoute, requireFeatureFlag('feature.flows.enabled'), flowsRoutes);
legacyRouter.use('/security', protectedRoute, securityRoutes);
legacyRouter.use('/cluster', protectedRoute, clusterRoutes);
legacyRouter.use('/ai', protectedRoute, aiRoutes);
legacyRouter.use('/templates', protectedRoute, templatesRoutes);
app.use(legacyRouter);

// Legacy support (optional, but cleaning up for Camelfarm V3)
if (!isTestRuntime) {
  const { getSwaggerSpec } = require('./utils/swagger');
  if (config.security.exposeApiDocs) {
    app.use(
      '/api-docs',
      sensitiveSurfaceGuard('API Docs'),
      ipAllowlistGuard('sensitive', 'API Docs'),
      swaggerUi.serve,
      swaggerUi.setup(getSwaggerSpec())
    );
  } else {
    logger.info('API docs disabled by security default', {
      nodeEnv: process.env.NODE_ENV || 'development',
    });
  }
} else {
  logger.info('Skipping Swagger spec generation for test/lightweight execution', {
    nodeEnv: process.env.NODE_ENV || 'development',
    vitest: process.env.VITEST || 'false',
  });
}

// Root Health check
app.get('/', (_req, res) => res.json({ status: 'ok', version: '2.0.0', platform: 'CamelFarm' }));
app.get('/health', async (_req, res) => {
  try {
    const { prisma } = await import('./prisma');

    // 1. Check DB Connection
    await prisma.$queryRaw`SELECT 1`;

    // 2. Check Redis Connection
    let redisStatus = 'unreachable';
    try {
      const Redis = (await import('ioredis')).default;
      const redisUrl = process.env.REDIS_URL || `redis://${config.redis.host}:${config.redis.port}`;
      const redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        connectTimeout: 2000
      });
      await redis.ping();
      redisStatus = 'connected';
      await redis.quit();
    } catch (e) {
      logger.warn('Redis healthcheck failed', { error: (e as Error).message });
    }

    // 3. Worker check (disabled pending schema update)
    let workerStatus = 'offline';

    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      db: 'connected',
      redis: redisStatus,
      worker: workerStatus,
      lastHeartbeat: null
    });
  } catch (err: any) {
    logger.error('Health check failed', { error: err?.message });
    res.status(503).json({ status: 'degraded', uptime: process.uptime(), db: 'unreachable' });
  }
});

app.all('/.well-known/camel-admin-export', async (req, res) => {
  if (!config.security.honeyEnabled) {
    return res.status(404).end();
  }
  await CanaryTrapService.tripHoneyEndpoint(req);
  return res.status(404).end();
});

// ─── Bull Board (queue dashboard) ─────────────────────────────────
if (runtimeServicesEnabled) {
  try {
    mountBullBoard(app);
    logger.info('Bull Board mounted at /admin/queues');
  } catch (err) {
    logger.warn('Bull Board not mounted', { error: (err as Error).message });
  }
} else {
  logger.info('Skipping Bull Board mount for test/lightweight execution', {
    nodeEnv: process.env.NODE_ENV || 'development',
    vitest: process.env.VITEST || 'false',
  });
}

// ─── Start ────────────────────────────────────────────────────────
async function startServer() {
  const preferredPort = config.port;
  const resolvedPort = process.env.NODE_ENV === 'production'
    ? preferredPort
    : await findAvailablePort(preferredPort);

  if (resolvedPort !== preferredPort) {
    logger.warn('Preferred port unavailable, using fallback port', {
      preferredPort,
      resolvedPort
    });
  }

  await publishDevPort(resolvedPort);

  if (config.nodeEnv !== 'production' && config.host !== '127.0.0.1' && config.host !== 'localhost') {
    logger.warn('Non-local host binding detected outside production', {
      host: config.host,
      nodeEnv: config.nodeEnv,
    });
  }

  app.listen(resolvedPort, config.host, () => {
    logger.info('Multilogin Platform API running', {
      port: resolvedPort,
      host: config.host,
      preferredPort,
      nodeEnv: process.env.NODE_ENV || 'development',
    });
  });
}

const shutdown = async (signal: string) => {
  logger.info(`[SERVER] Received ${signal}. Starting graceful shutdown...`);
  try {
    const { BrowserNodeService } = require('./services/browser.node');
    await BrowserNodeService.dispose();
    logger.info('[SERVER] Resources disposed. Exiting.');
    process.exit(0);
  } catch (err) {
    logger.error('[SERVER] Error during shutdown', { error: (err as any).message });
    process.exit(1);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

if (process.env.NODE_ENV !== 'test') {
  startServer().catch((error: any) => {
    logger.error('Failed to start server', { error: error?.message });
    process.exit(1);
  });
}
