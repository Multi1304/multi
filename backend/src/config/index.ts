// Centralized configuration — all env vars read here
import path from 'path';

export const config = {
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || '127.0.0.1',
  trustedProxyHops: Number(process.env.TRUST_PROXY_HOPS || 1),

  nodeEnv: process.env.NODE_ENV || 'development',

  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    accessExpiresIn: '4h',    // Long-lived access token for automation sessions
    refreshExpiresIn: '7d',     // Long-lived refresh token
    refreshExpiresMs: 7 * 24 * 60 * 60 * 1000,
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    prices: {
      pro: process.env.STRIPE_PRICE_PRO || '',
      enterprise: process.env.STRIPE_PRICE_ENTERPRISE || '',
      ultra: process.env.STRIPE_PRICE_ULTRA || '',
    },
  },

  encryption: {
    key: process.env.ENCRYPTION_KEY || 'default-dev-key-change-in-prod!!',
  },

  mitigation: {
    twoCaptchaApiKey: process.env.TWOCAPTCHA_API_KEY || '',
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      verifyServiceSid: process.env.TWILIO_VERIFY_SERVICE_SID || '',
    },
  },

  worker: {
    concurrency: Number(process.env.WORKER_CONCURRENCY || 5),
    id: process.env.WORKER_ID || `worker-${process.pid}`,
  },
  memoryAdmission: {
    enabled: process.env.MEMORY_ADMISSION_ENABLED !== 'false',
    maxRssMb: Number(process.env.MEMORY_ADMISSION_MAX_RSS_MB || 900),
    reserveMb: Number(process.env.MEMORY_ADMISSION_RESERVE_MB || 128),
  },

  profilesDir: process.env.PROFILES_DIR || path.resolve(process.cwd(), 'profiles'),
  profileStateDir: process.env.PROFILE_STATE_DIR || path.resolve(process.cwd(), 'profile-state'),
  profileSyncDir: process.env.PROFILE_SYNC_DIR || path.resolve(process.cwd(), 'cloud-sync', 'profiles'),
  browserRuntime: {
    strictMode: process.env.BROWSER_STRICT_MODE !== 'false',
    allowAutoHealingMutations: process.env.BROWSER_ALLOW_AUTO_HEALING_MUTATIONS === 'true',
    allowAggressiveClicks: process.env.BROWSER_ALLOW_AGGRESSIVE_CLICKS === 'true',
    humanPolicy: process.env.BROWSER_HUMAN_POLICY || 'balanced',
  },
  objectStorage: {
    provider: process.env.OBJECT_STORAGE_PROVIDER || 'filesystem',
    bucket: process.env.OBJECT_STORAGE_BUCKET || '',
    region: process.env.OBJECT_STORAGE_REGION || 'eu-west-1',
    endpoint: process.env.OBJECT_STORAGE_ENDPOINT || '',
    accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY || '',
    forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE !== 'false',
    keyPrefix: process.env.OBJECT_STORAGE_KEY_PREFIX || 'profiles',
  },
  releaseGates: {
    schedulerEnabled: process.env.RELEASE_GATES_SCHEDULER_ENABLED !== 'false',
    intervalMinutes: Number(process.env.RELEASE_GATES_INTERVAL_MINUTES || 30),
    releaseLabel: process.env.RELEASE_GATES_LABEL || process.env.APP_VERSION || 'dev-local',
    commitRef: process.env.RELEASE_GATES_COMMIT || process.env.COMMIT_REF || 'workspace',
  },
  soakTesting: {
    schedulerEnabled: process.env.SOAK_TEST_SCHEDULER_ENABLED !== 'false',
    intervalMinutes: Number(process.env.SOAK_TEST_INTERVAL_MINUTES || 45),
    windowMinutes: Number(process.env.SOAK_TEST_WINDOW_MINUTES || 180),
  },
  benchmarkSeries: {
    schedulerEnabled: process.env.BENCHMARK_SERIES_SCHEDULER_ENABLED !== 'false',
    intervalHours: Number(process.env.BENCHMARK_SERIES_INTERVAL_HOURS || 6),
  },
  predictiveWarmup: {
    schedulerEnabled: process.env.PREDICTIVE_WARMUP_SCHEDULER_ENABLED !== 'false',
    rebuildIntervalHours: Number(process.env.PREDICTIVE_WARMUP_REBUILD_INTERVAL_HOURS || 8),
    executionIntervalMinutes: Number(process.env.PREDICTIVE_WARMUP_EXECUTION_INTERVAL_MINUTES || 20),
  },
  weeklyComparativeReport: {
    schedulerEnabled: process.env.WEEKLY_COMPARATIVE_REPORT_SCHEDULER_ENABLED !== 'false',
    checkIntervalHours: Number(process.env.WEEKLY_COMPARATIVE_REPORT_CHECK_INTERVAL_HOURS || 12),
  },
  incidents: {
    schedulerEnabled: process.env.INCIDENT_SCHEDULER_ENABLED !== 'false',
    intervalMinutes: Number(process.env.INCIDENT_SCHEDULER_INTERVAL_MINUTES || 10),
  },
  ai: {
    mode: process.env.AI_MODE || 'router',
    preferredProvider: process.env.AI_PREFERRED_PROVIDER || 'groq',
    fallbackProvider: process.env.AI_FALLBACK_PROVIDER || 'ollama',
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
    ollamaModel: process.env.OLLAMA_MODEL || 'qwen3:8b',
    groqApiKey: process.env.GROQ_API_KEY || '',
  },
  destructiveActions: {
    enabled: process.env.NODE_ENV !== 'test' && process.env.SECURITY_DELAY_DESTRUCTIVE_ACTIONS !== 'false',
    defaultDelaySeconds: Number(process.env.SECURITY_DESTRUCTIVE_DELAY_SECONDS || 45),
    schedulerIntervalSeconds: Number(process.env.SECURITY_DESTRUCTIVE_SCHEDULER_INTERVAL_SECONDS || 5),
  },
  security: {
    exposeApiDocs: process.env.SECURITY_EXPOSE_API_DOCS === 'true',
    exposeBullBoard: process.env.SECURITY_EXPOSE_BULL_BOARD === 'true',
    allowRemoteSensitiveSurfaces: process.env.SECURITY_ALLOW_REMOTE_SENSITIVE_SURFACES === 'true',
    adminIpAllowlist: (process.env.SECURITY_ADMIN_IP_ALLOWLIST || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    sensitiveIpAllowlist: (process.env.SECURITY_SENSITIVE_IP_ALLOWLIST || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    requireSensitiveMfa: process.env.SECURITY_REQUIRE_SENSITIVE_MFA === 'true',
    stepUpTtlMinutes: Number(process.env.SECURITY_STEP_UP_TTL_MINUTES || 10),
    canaryEnabled: process.env.SECURITY_CANARY_ENABLED !== 'false',
    honeyEnabled: process.env.SECURITY_HONEY_ENABLED !== 'false',
    postureSchedulerEnabled: process.env.SECURITY_POSTURE_SCHEDULER_ENABLED !== 'false',
    postureSchedulerCheckMinutes: Number(process.env.SECURITY_POSTURE_SCHEDULER_CHECK_MINUTES || 60),
  },
};

const INSECURE_DEFAULTS = [
  'dev-secret-change-me',
  'super-secret-change-in-production',
  'default-dev-key-change-in-prod!!',
];

/**
 * Validate configuration on startup.
 * In production, fail hard if default secrets are used.
 */
export function validateConfig() {
  const isProduction = config.nodeEnv === 'production';

  if (config.jwt.secret === 'Jw==' || INSECURE_DEFAULTS.includes(config.jwt.secret)) {
    throw new Error('FATAL: JWT_SECRET is using an insecure default value.');
  }

  if (INSECURE_DEFAULTS.includes(config.encryption.key)) {
    throw new Error('FATAL: ENCRYPTION_KEY is using an insecure default value.');
  }
  
  if (isProduction && !config.stripe.secretKey) {
    throw new Error('FATAL: STRIPE_SECRET_KEY cannot be empty in production.');
  }
}
