import { Router } from 'express';
import { prisma } from '../prisma';
import { requireRole, requireApiKeyScope } from '../middleware/auth';
import { logger } from '../utils/logger';
import { logAudit } from '../services/audit.service';
import { z } from 'zod';
import { ObjectStorageService } from '../services/objectStorage.service';
import { FingerprintValidationService } from '../services/fingerprintValidation.service';
import { TenantCapacityService } from '../services/tenantCapacity.service';
import { SandboxAutomationService } from '../services/sandboxAutomation.service';
import { SelectorAssistService } from '../services/selectorAssist.service';
import { SandboxCompatibilityLabService } from '../services/sandboxCompatibilityLab.service';
import { RuntimeHardeningService } from '../services/runtimeHardening.service';
import { PromotionGateService } from '../services/promotionGate.service';
import { NetworkRoutingService } from '../services/networkRouting.service';
import { NetworkObservabilityService } from '../services/networkObservability.service';
import { NetworkMetadataCatalogService } from '../services/networkMetadataCatalog.service';
import { SandboxRuntimeEmulationService } from '../services/sandboxRuntimeEmulation.service';
import { ProxyAdvisorService } from '../services/proxyAdvisor.service';
import { NetworkStrategyWizardService } from '../services/networkStrategyWizard.service';
import { PoolSizingPlannerService } from '../services/poolSizingPlanner.service';
import { EgressDependencyReportService } from '../services/egressDependencyReport.service';
import { EgressLanePlannerService } from '../services/egressLanePlanner.service';
import { EgressLanePolicyService } from '../services/egressLanePolicy.service';
import { SelfHostedVpnBootstrapService } from '../services/selfHostedVpnBootstrap.service';

export const networkRouter = Router();

// --- SCHEMAS ---
const createProxyPoolSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  rotationStrategy: z.enum(['ROUND_ROBIN', 'RANDOM', 'STICKY_PER_PROFILE']).default('ROUND_ROBIN')
});

const createProxyEndpointSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  username: z.string().optional(),
  password: z.string().optional(),
  protocol: z.enum(['HTTP', 'HTTPS', 'SOCKS5']).optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  provider: z.string().optional(),
  isp: z.string().optional(),
  carrier: z.string().optional(),
  asn: z.string().optional(),
  endpointType: z.enum(['RESIDENTIAL', 'MOBILE', 'DATACENTER', 'VPN']).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  isActive: z.boolean().optional(),
});

const proxyRoutingPreviewSchema = z.object({
  profileId: z.string().optional(),
  proxyPoolId: z.string().optional(),
  proxyEndpointId: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  platform: z.string().optional(),
  blendTypes: z.array(z.string()).optional(),
  allowVpn: z.boolean().optional(),
  sticky: z.boolean().optional(),
});
const selfHostedExitSchema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  protocol: z.enum(['HTTP', 'HTTPS', 'SOCKS5']).optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  group: z.string().min(1),
  cluster: z.string().min(1),
  provider: z.string().optional(),
  activate: z.boolean().optional(),
});
const registerSelfHostedExitsSchema = z.object({
  exits: z.array(selfHostedExitSchema).min(1),
});
const previewSelfHostedImportSchema = z.object({
  payload: z.string().min(1),
  format: z.enum(['csv', 'json']).optional(),
});
const updateSandboxRuntimeEmulationSchema = z.object({
  enabled: z.boolean().optional(),
  allowedHosts: z.array(z.string()).optional(),
  dynamicCanvasEvolution: z.boolean().optional(),
  emulateWebRTC: z.boolean().optional(),
  emulateAudio: z.boolean().optional(),
  emulateBattery: z.boolean().optional(),
  intervalMinMinutes: z.number().int().min(1).max(60).optional(),
  intervalMaxMinutes: z.number().int().min(1).max(120).optional(),
});

// Enforce ADMIN/MANAGER roles for all network routes
networkRouter.use(requireRole('ADMIN', 'MANAGER')); // Both ADMIN and MANAGER can manage network stuff
networkRouter.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return requireApiKeyScope('network:read')(req as any, res, next);
  }
  return requireApiKeyScope('network:write')(req as any, res, next);
});

// --- PROXY POOLS ---

// GET /network/proxy-pools
networkRouter.get('/proxy-pools', async (req, res, next) => {
  try {
    const pools = await (prisma.proxyPool as any).findMany({
      where: { tenantId: (req as any).user!.tenantId },
      include: { _count: { select: { endpoints: true } } }
    });
    res.json(pools.map((pool: any) => ({
      ...pool,
      description: pool.description || pool.settings?.description || '',
      rotationStrategy: pool.rotationStrategy || pool.settings?.rotationStrategy || 'ROUND_ROBIN',
    })));
  } catch (error) {
    next(error);
  }
});

// POST /network/proxy-pools
networkRouter.post('/proxy-pools', async (req, res, next) => {
  try {
    const data = createProxyPoolSchema.parse(req.body);
    const pool = await (prisma.proxyPool as any).create({
      data: {
        name: data.name,
        tenantId: (req as any).user!.tenantId,
        description: data.description || null,
        rotationStrategy: data.rotationStrategy,
        settings: {
          description: data.description || '',
          rotationStrategy: data.rotationStrategy,
        }
      }
    });

    await logAudit({
      tenantId: (req as any).user!.tenantId,
      userId: (req as any).user!.userId,
      action: 'proxy_pool_created',
      resource: `proxy_pool:${pool.id}`,
      detail: { name: pool.name, rotationStrategy: data.rotationStrategy }
    });

    res.status(201).json({
      ...pool,
      description: data.description || '',
      rotationStrategy: data.rotationStrategy,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /network/proxy-pools/:id
networkRouter.put('/proxy-pools/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = createProxyPoolSchema.partial().parse(req.body);

    const existing = await (prisma.proxyPool as any).findFirst({
      where: { id, tenantId: (req as any).user!.tenantId },
    });
    if (!existing) return res.status(404).json({ error: 'Proxy pool not found' });

    const nextSettings = {
      ...(existing.settings || {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.rotationStrategy ? { rotationStrategy: data.rotationStrategy } : {}),
    };

    const pool = await (prisma.proxyPool as any).update({
      where: { id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.rotationStrategy ? { rotationStrategy: data.rotationStrategy } : {}),
        settings: nextSettings,
      }
    });

    await logAudit({
      tenantId: (req as any).user!.tenantId,
      userId: (req as any).user!.userId,
      action: 'proxy_pool_updated',
      resource: `proxy_pool:${id}`,
      detail: data
    });

    res.json({
      ...pool,
      description: pool.description || nextSettings.description || '',
      rotationStrategy: pool.rotationStrategy || nextSettings.rotationStrategy || 'ROUND_ROBIN',
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /network/proxy-pools/:id
networkRouter.delete('/proxy-pools/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    await (prisma.proxyPool as any).delete({
      where: { id, tenantId: (req as any).user!.tenantId }
    });

    await logAudit({
      tenantId: (req as any).user!.tenantId,
      userId: (req as any).user!.userId,
      action: 'proxy_pool_deleted',
      resource: `proxy_pool:${id}`
    });

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// --- ENDPOINTS ---

// GET /network/proxy-pools/:id/endpoints
networkRouter.get('/proxy-pools/:id/endpoints', async (req, res, next) => {
  try {
    const { id } = req.params;
    const endpoints = await (prisma.proxyEndpoint as any).findMany({
      where: { poolId: id, pool: { tenantId: (req as any).user!.tenantId } }
    });
    res.json(endpoints.map((endpoint: any) => ({
      ...endpoint,
      isActive: String(endpoint.status || 'ACTIVE').toUpperCase() !== 'DISABLED',
      country: endpoint.country || null,
      city: endpoint.city || null,
    })));
  } catch (error) {
    next(error);
  }
});

// POST /network/proxy-pools/:id/endpoints
networkRouter.post('/proxy-pools/:id/endpoints', async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = createProxyEndpointSchema.parse(req.body);

    // Verify pool belongs to tenant
    const pool = await (prisma.proxyPool as any).findFirst({
      where: { id, tenantId: (req as any).user!.tenantId }
    });

    if (!pool) return res.status(404).json({ error: 'Proxy pool not found' });

    const endpoint = await (prisma.proxyEndpoint as any).create({
      data: {
        host: data.host,
        port: data.port,
        username: data.username,
        password: data.password,
        protocol: data.protocol || 'HTTP',
        poolId: id,
        tenantId: (req as any).user!.tenantId,
        country: data.country || null,
        city: data.city || null,
        region: data.region || null,
        provider: data.provider || null,
        isp: data.isp || null,
        carrier: data.carrier || null,
        asn: data.asn || null,
        endpointType: data.endpointType || (pool.type || 'RESIDENTIAL'),
        metadata: data.metadata || null,
        isActive: data.isActive !== false,
        status: data.isActive === false ? 'DISABLED' : 'ACTIVE',
      }
    });

    await logAudit({
      tenantId: (req as any).user!.tenantId,
      userId: (req as any).user!.userId,
      action: 'proxy_endpoint_created',
      resource: `proxy_endpoint:${endpoint.id}`,
      detail: { poolId: id, host: data.host, country: data.country, city: data.city }
    });

    res.status(201).json({
      ...endpoint,
      country: data.country || null,
      city: data.city || null,
      region: data.region || null,
      provider: data.provider || null,
      isp: data.isp || null,
      carrier: data.carrier || null,
      asn: data.asn || null,
      endpointType: data.endpointType || (pool.type || 'RESIDENTIAL'),
      metadata: data.metadata || null,
      isActive: data.isActive !== false,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /network/proxy-endpoints/:id
networkRouter.put('/proxy-endpoints/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = createProxyEndpointSchema.partial().and(z.object({ isActive: z.boolean().optional() })).parse(req.body);

    const existing = await (prisma.proxyEndpoint as any).findFirst({
      where: { id, tenantId: (req as any).user!.tenantId }
    });
    if (!existing) return res.status(404).json({ error: 'Proxy endpoint not found' });

    const endpoint = await (prisma.proxyEndpoint as any).update({
      where: { id },
      data: {
        ...(data.host ? { host: data.host } : {}),
        ...(data.port ? { port: data.port } : {}),
        ...(data.username !== undefined ? { username: data.username } : {}),
        ...(data.password !== undefined ? { password: data.password } : {}),
        ...(data.protocol ? { protocol: data.protocol } : {}),
        ...(data.country !== undefined ? { country: data.country } : {}),
        ...(data.city !== undefined ? { city: data.city } : {}),
        ...(data.region !== undefined ? { region: data.region } : {}),
        ...(data.provider !== undefined ? { provider: data.provider } : {}),
        ...(data.isp !== undefined ? { isp: data.isp } : {}),
        ...(data.carrier !== undefined ? { carrier: data.carrier } : {}),
        ...(data.asn !== undefined ? { asn: data.asn } : {}),
        ...(data.endpointType !== undefined ? { endpointType: data.endpointType } : {}),
        ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.isActive !== undefined ? { status: data.isActive ? 'ACTIVE' : 'DISABLED' } : {}),
      }
    });

    await logAudit({
      tenantId: (req as any).user!.tenantId,
      userId: (req as any).user!.userId,
      action: 'proxy_endpoint_updated',
      resource: `proxy_endpoint:${id}`,
      detail: data
    });

    res.json({
      ...endpoint,
      country: endpoint.country || null,
      city: endpoint.city || null,
      region: endpoint.region || null,
      provider: endpoint.provider || null,
      isp: endpoint.isp || null,
      carrier: endpoint.carrier || null,
      asn: endpoint.asn || null,
      endpointType: endpoint.endpointType || null,
      metadata: endpoint.metadata || null,
      isActive: data.isActive !== undefined ? data.isActive : String(endpoint.status || 'ACTIVE').toUpperCase() !== 'DISABLED',
    });
  } catch (error) {
    next(error);
  }
});

networkRouter.post('/proxy-endpoints/:id/health-check', async (req, res, next) => {
  try {
    const endpoint = await (prisma.proxyEndpoint as any).findFirst({
      where: { id: req.params.id, tenantId: (req as any).user!.tenantId },
    });
    if (!endpoint) return res.status(404).json({ error: 'Proxy endpoint not found' });
    const result = await NetworkRoutingService.healthCheckEndpoint(req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

networkRouter.post('/proxy-pools/:id/health-check', async (req, res, next) => {
  try {
    const pool = await (prisma.proxyPool as any).findFirst({
      where: { id: req.params.id, tenantId: (req as any).user!.tenantId },
    });
    if (!pool) return res.status(404).json({ error: 'Proxy pool not found' });
    const result = await NetworkRoutingService.healthCheckPool(req.params.id, (req as any).user!.tenantId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

networkRouter.post('/proxy-routing/resolve', async (req, res, next) => {
  try {
    const data = proxyRoutingPreviewSchema.parse(req.body || {});
    const profile = data.profileId
      ? await (prisma.profile as any).findFirst({
          where: { id: data.profileId, tenantId: (req as any).user!.tenantId },
          include: { proxyPool: true, networkPolicy: true },
        })
      : null;
    const result = await NetworkRoutingService.resolve({
      tenantId: (req as any).user!.tenantId,
      profileId: data.profileId || profile?.id || null,
      profile,
      proxyPoolId: data.proxyPoolId || null,
      proxyEndpointId: data.proxyEndpointId || null,
      country: data.country || profile?.geolocation?.country || profile?.geolocation?.countryCode || null,
      city: data.city || profile?.geolocation?.city || null,
      platform: data.platform || profile?.platform || null,
      blendTypes: data.blendTypes,
      allowVpn: data.allowVpn,
      sticky: data.sticky,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

networkRouter.post('/pool-recommendations', async (req, res, next) => {
  try {
    const data = proxyRoutingPreviewSchema.parse(req.body || {});
    const recommendations = await NetworkObservabilityService.recommendPools({
      tenantId: (req as any).user!.tenantId,
      platform: data.platform || null,
      country: data.country || null,
      city: data.city || null,
      allowVpn: data.allowVpn,
    });
    res.json({
      platformProfile: NetworkMetadataCatalogService.getPlatformProfile(data.platform || null),
      recommendations,
    });
  } catch (error) {
    next(error);
  }
});

networkRouter.get('/metadata-catalog', async (_req, res, next) => {
  try {
    res.json(NetworkMetadataCatalogService.getCatalog());
  } catch (error) {
    next(error);
  }
});

networkRouter.get('/proxy-advisor', async (req, res, next) => {
  try {
    const data = await ProxyAdvisorService.getAdvisor((req as any).user!.tenantId);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

networkRouter.get('/strategy-wizard', async (req, res, next) => {
  try {
    const data = await NetworkStrategyWizardService.getPlan((req as any).user!.tenantId);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

networkRouter.get('/pool-sizing-planner', async (req, res, next) => {
  try {
    const data = await PoolSizingPlannerService.getPlan((req as any).user!.tenantId);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

networkRouter.get('/egress-dependency-report', async (req, res, next) => {
  try {
    const data = await EgressDependencyReportService.getReport((req as any).user!.tenantId);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

networkRouter.get('/egress-lane-planner', async (req, res, next) => {
  try {
    const data = await EgressLanePlannerService.getPlan((req as any).user!.tenantId);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

networkRouter.get('/egress-lane-policy', async (req, res, next) => {
  try {
    const data = await EgressLanePolicyService.getEffectivePolicy((req as any).user!.tenantId);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

networkRouter.get('/self-hosted-vpn-bootstrap', async (req, res, next) => {
  try {
    const data = await SelfHostedVpnBootstrapService.getPack((req as any).user!.tenantId);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

networkRouter.post('/self-hosted-vpn-bootstrap/pools', async (req, res, next) => {
  try {
    const tenantId = (req as any).user!.tenantId;
    const userId = (req as any).user!.userId;
    const data = await SelfHostedVpnBootstrapService.ensureSuggestedPools(tenantId);
    await logAudit({
      tenantId,
      userId,
      action: 'self_hosted_vpn_pools_bootstrapped',
      resource: 'network:self_hosted_vpn_pools',
      detail: {
        createdPools: data.createdPools.length,
        reusedPools: data.reusedPools.length,
      },
    });
    res.status(201).json(data);
  } catch (error) {
    next(error);
  }
});

networkRouter.post('/self-hosted-vpn-bootstrap/register-exits', async (req, res, next) => {
  try {
    const tenantId = (req as any).user!.tenantId;
    const userId = (req as any).user!.userId;
    const data = registerSelfHostedExitsSchema.parse(req.body || {});
    const result = await SelfHostedVpnBootstrapService.registerExits(tenantId, data.exits);
    await logAudit({
      tenantId,
      userId,
      action: 'self_hosted_vpn_exits_registered',
      resource: 'network:self_hosted_vpn_exits',
      detail: {
        createdEndpoints: result.createdEndpoints.length,
        updatedEndpoints: result.updatedEndpoints.length,
        poolsTouched: result.poolsTouched.length,
      },
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

networkRouter.post('/self-hosted-vpn-bootstrap/preview-import', async (req, res, next) => {
  try {
    const data = previewSelfHostedImportSchema.parse(req.body || {});
    const result = SelfHostedVpnBootstrapService.previewImport(data.payload, data.format);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

networkRouter.get('/self-hosted-vpn-bootstrap/onboarding-checklist', async (req, res, next) => {
  try {
    const force = String(req.query.force || '').toLowerCase() === 'true';
    const data = await SelfHostedVpnBootstrapService.getOnboardingChecklist((req as any).user!.tenantId, force);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

networkRouter.get('/self-hosted-vpn-bootstrap/topology-plan', async (req, res, next) => {
  try {
    const data = await SelfHostedVpnBootstrapService.getTopologyPlan((req as any).user!.tenantId);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

// --- NETWORK POLICIES ---

const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;

const createNetworkPolicySchema = z.object({
  name: z.string().min(1),
  dnsPrimary: z.string().regex(ipRegex).optional().or(z.literal('')),
  dnsSecondary: z.string().regex(ipRegex).optional().or(z.literal('')),
  webrtcPolicy: z.enum(['DEFAULT', 'DISABLE', 'FAKE_LOCAL', 'FAKE_PUBLIC']).default('DEFAULT'),
  timezonePolicy: z.enum(['AUTO', 'FIXED']).default('AUTO'),
  timezoneValue: z.string().optional()
});

// GET /network/policies
networkRouter.get('/policies', async (req, res, next) => {
  try {
    const policies = await (prisma.networkPolicy as any).findMany({
      where: { tenantId: (req as any).user!.tenantId }
    });
    res.json(policies);
  } catch (error) {
    next(error);
  }
});

// POST /network/policies
networkRouter.post('/policies', async (req, res, next) => {
  try {
    const data = createNetworkPolicySchema.parse(req.body);
    const policy = await (prisma.networkPolicy as any).create({
      data: { ...data, tenantId: (req as any).user!.tenantId }
    });

    await logAudit({
      tenantId: (req as any).user!.tenantId,
      userId: (req as any).user!.userId,
      action: 'network_policy_created',
      resource: `network_policy:${policy.id}`,
      detail: { name: policy.name }
    });

    res.status(201).json(policy);
  } catch (error) {
    next(error);
  }
});

// PUT /network/policies/:id
networkRouter.put('/policies/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = createNetworkPolicySchema.partial().parse(req.body);
    const policy = await (prisma.networkPolicy as any).update({
      where: { id, tenantId: (req as any).user!.tenantId },
      data
    });

    await logAudit({
      tenantId: (req as any).user!.tenantId,
      userId: (req as any).user!.userId,
      action: 'network_policy_updated',
      resource: `network_policy:${id}`,
      detail: data
    });

    res.json(policy);
  } catch (error) {
    next(error);
  }
});

// DELETE /network/policies/:id
networkRouter.delete('/policies/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await (prisma.networkPolicy as any).delete({
      where: { id, tenantId: (req as any).user!.tenantId }
    });

    await logAudit({
      tenantId: (req as any).user!.tenantId,
      userId: (req as any).user!.userId,
      action: 'network_policy_deleted',
      resource: `network_policy:${id}`
    });

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// --- FINGERPRINT PRESETS ---

const createFingerprintPresetSchema = z.object({
  name: z.string().min(1),
  platform: z.enum([
    'FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'AMAZON', 'GMAIL', 'LINKEDIN',
    'SPOTIFY', 'APPLE_MUSIC', 'YOUTUBE', 'TWITTER_X', 'REDDIT',
    'PINTEREST', 'DISCORD', 'TWITCH', 'OTHER'
  ]).default('OTHER'),
  browser: z.string().default('CHROME'),
  config: z.record(z.string(), z.any()).optional(),
  userAgent: z.string().min(5).optional(),
  screenResolution: z.string().regex(/^\d+x\d+$/).optional(),
  language: z.string().default('en-US').optional(),
  platformOS: z.string().optional(),
  hardwareConcurrency: z.number().int().optional(),
  deviceMemory: z.number().int().optional()
});

const updateObjectStorageSchema = z.object({
  provider: z.enum(['filesystem', 's3']).optional(),
  bucket: z.string().optional(),
  region: z.string().optional(),
  endpoint: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  forcePathStyle: z.boolean().optional(),
  keyPrefix: z.string().optional(),
});

const updateRuntimeCapacitySchema = z.object({
  maxConcurrentProfiles: z.number().int().min(-1).optional(),
  rateLimitPerSeatPerMinute: z.number().int().min(1).optional(),
  licenseKey: z.string().nullable().optional(),
  licenseEnforced: z.boolean().optional(),
  licenseActive: z.boolean().optional(),
  licenseExpiresAt: z.string().nullable().optional(),
});

const updateSandboxAutomationSchema = z.object({
  captchaProvider: z.enum(['disabled', 'manual', 'stub_auto']).optional(),
  smsProvider: z.enum(['disabled', 'manual', 'stub_auto']).optional(),
  allowManualResolution: z.boolean().optional(),
  stubAutoResolveMs: z.number().int().min(100).max(30000).optional(),
});

const issueSandboxChallengeSchema = z.object({
  type: z.enum(['captcha', 'sms']),
  prompt: z.string().min(1),
  payload: z.record(z.string(), z.any()).optional(),
});

const resolveSandboxChallengeSchema = z.object({
  resolution: z.record(z.string(), z.any()),
});

const selectorAssistSchema = z.object({
  snapshot: z.string().min(1),
  label: z.string().min(1),
  controlKind: z.enum(['input', 'select', 'combobox', 'button']).optional(),
  localeHints: z.array(z.string()).optional(),
});

const sandboxScenarioSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  version: z.string().min(1).default('v1'),
  stage: z.string().min(1),
  controlKind: z.enum(['input', 'select', 'combobox', 'button']),
  label: z.string().min(1),
  localeHints: z.array(z.string()).default([]),
  expectedSelectors: z.array(z.string()).default([]),
  snapshot: z.string().min(1),
  tags: z.array(z.string()).default([]),
});

const promotionSchema = z.object({
  target: z.enum(['recommended', 'default']),
});

function normalizeFingerprintPresetInput(data: z.infer<typeof createFingerprintPresetSchema>) {
  if (data.config) {
    return {
      name: data.name,
      platform: data.platform,
      browser: data.browser || 'CHROME',
      config: data.config,
    };
  }

  return {
    name: data.name,
    platform: data.platform,
    browser: data.browser || 'CHROME',
    config: {
      userAgent: data.userAgent,
      screenResolution: data.screenResolution,
      language: data.language || 'en-US',
      platformOS: data.platformOS,
      hardwareConcurrency: data.hardwareConcurrency,
      deviceMemory: data.deviceMemory,
      presetVersion: 'route-v2',
    }
  };
}

// GET /network/fingerprint-presets
networkRouter.get('/fingerprint-presets', async (req, res, next) => {
  try {
    const tenantId = (req as any).user!.tenantId;
    const [presets, registry] = await Promise.all([
      (prisma.fingerprintPreset as any).findMany({
        where: { tenantId },
        orderBy: [{ name: 'asc' }]
      }),
      PromotionGateService.getRegistry(tenantId),
    ]);
    res.json(presets.map((preset: any) => ({
      ...preset,
      promotion: registry.presets[preset.id] || null,
    })));
  } catch (error) {
    next(error);
  }
});

networkRouter.post('/fingerprint-presets/:id/promote', async (req, res, next) => {
  try {
    const tenantId = (req as any).user!.tenantId;
    const userId = (req as any).user!.userId;
    const { target } = promotionSchema.parse(req.body);
    const result = await PromotionGateService.promote(tenantId, 'preset', req.params.id, target, userId);
    if (!result.ok) {
      return res.status(422).json(result);
    }

    await logAudit({
      tenantId,
      userId,
      action: 'fingerprint_preset_promoted',
      resource: `fingerprint_preset:${req.params.id}`,
      detail: { target, gateSnapshotId: result.snapshot.id, score: result.evaluation.score },
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

networkRouter.delete('/fingerprint-presets/:id/promote', async (req, res, next) => {
  try {
    const tenantId = (req as any).user!.tenantId;
    const userId = (req as any).user!.userId;
    await PromotionGateService.clearPromotion(tenantId, 'preset', req.params.id);
    await logAudit({
      tenantId,
      userId,
      action: 'fingerprint_preset_promotion_cleared',
      resource: `fingerprint_preset:${req.params.id}`,
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

networkRouter.get('/fingerprint-presets/validation-matrix', async (req, res, next) => {
  try {
    const tenantId = (req as any).user!.tenantId;
    const [presets, profiles, registry] = await Promise.all([
      (prisma.fingerprintPreset as any).findMany({
        where: { tenantId },
        orderBy: [{ name: 'asc' }]
      }),
      (prisma.profile as any).findMany({
        where: { tenantId },
        select: { id: true, fingerprintPresetId: true }
      }),
      PromotionGateService.getRegistry(tenantId),
    ]);

    const matrix = FingerprintValidationService.buildMatrix(presets, profiles);
    return res.json({
      summary: FingerprintValidationService.summarizeMatrix(matrix),
      rows: matrix.map((row: any) => ({
        ...row,
        promotion: registry.presets[row.id] || null,
      }))
    });
  } catch (error) {
    next(error);
  }
});

networkRouter.get('/runtime-hardening', async (req, res, next) => {
  try {
    const tenantId = (req as any).user!.tenantId;
    const [presets, profiles] = await Promise.all([
      (prisma.fingerprintPreset as any).findMany({
        where: { tenantId },
        select: { id: true, name: true, platform: true, browser: true, config: true },
      }),
      (prisma.profile as any).findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          platform: true,
          proxyConfig: true,
          fingerprint: true,
          fingerprintPresetId: true,
        },
      }),
    ]);
    res.json(RuntimeHardeningService.buildSnapshot(presets, profiles));
  } catch (error) {
    next(error);
  }
});

// POST /network/fingerprint-presets
networkRouter.post('/fingerprint-presets', async (req, res, next) => {
  try {
    const data = createFingerprintPresetSchema.parse(req.body);
    const normalized = normalizeFingerprintPresetInput(data);
    const preset = await (prisma.fingerprintPreset as any).create({
      data: { ...normalized, tenantId: (req as any).user!.tenantId }
    });

    await logAudit({
      tenantId: (req as any).user!.tenantId,
      userId: (req as any).user!.userId,
      action: 'fingerprint_preset_created',
      resource: `fingerprint_preset:${preset.id}`,
      detail: { name: preset.name }
    });

    res.status(201).json(preset);
  } catch (error) {
    next(error);
  }
});

// PUT /network/fingerprint-presets/:id
networkRouter.put('/fingerprint-presets/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = createFingerprintPresetSchema.partial().parse(req.body);
    const normalized = normalizeFingerprintPresetInput({
      name: data.name || 'Updated preset',
      platform: data.platform || 'OTHER',
      browser: data.browser || 'CHROME',
      config: data.config,
      userAgent: data.userAgent,
      screenResolution: data.screenResolution,
      language: data.language,
      platformOS: data.platformOS,
      hardwareConcurrency: data.hardwareConcurrency,
      deviceMemory: data.deviceMemory,
    });
    const preset = await (prisma.fingerprintPreset as any).update({
      where: { id, tenantId: (req as any).user!.tenantId },
      data: {
        ...(data.name ? { name: normalized.name } : {}),
        ...(data.platform ? { platform: normalized.platform } : {}),
        ...(data.browser ? { browser: normalized.browser } : {}),
        ...(data.config || data.userAgent || data.screenResolution || data.language || data.platformOS || data.hardwareConcurrency !== undefined || data.deviceMemory !== undefined
          ? { config: normalized.config }
          : {}),
      }
    });

    await logAudit({
      tenantId: (req as any).user!.tenantId,
      userId: (req as any).user!.userId,
      action: 'fingerprint_preset_updated',
      resource: `fingerprint_preset:${id}`,
      detail: data
    });

    res.json(preset);
  } catch (error) {
    next(error);
  }
});

// DELETE /network/fingerprint-presets/:id
networkRouter.delete('/fingerprint-presets/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await (prisma.fingerprintPreset as any).delete({
      where: { id, tenantId: (req as any).user!.tenantId }
    });

    await logAudit({
      tenantId: (req as any).user!.tenantId,
      userId: (req as any).user!.userId,
      action: 'fingerprint_preset_deleted',
      resource: `fingerprint_preset:${id}`
    });

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

networkRouter.get('/object-storage/status', async (_req, res, next) => {
  try {
    const status = await ObjectStorageService.getStatus();
    res.json(status);
  } catch (error) {
    next(error);
  }
});

networkRouter.put('/object-storage/config', async (req, res, next) => {
  try {
    const data = updateObjectStorageSchema.parse(req.body);
    const status = await ObjectStorageService.updateConfig(data);
    await logAudit({
      tenantId: (req as any).user!.tenantId,
      userId: (req as any).user!.userId,
      action: 'object_storage_config_updated',
      resource: 'system:object_storage',
      detail: {
        provider: data.provider,
        bucket: data.bucket,
        region: data.region,
        endpoint: data.endpoint,
        keyPrefix: data.keyPrefix,
        forcePathStyle: data.forcePathStyle,
        hasAccessKey: !!data.accessKeyId,
        hasSecret: !!data.secretAccessKey,
      }
    });
    res.json(status);
  } catch (error) {
    next(error);
  }
});

networkRouter.post('/object-storage/test', async (_req, res, next) => {
  try {
    const result = await ObjectStorageService.testConnection();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

networkRouter.get('/runtime-capacity', async (req, res, next) => {
  try {
    const status = await TenantCapacityService.getStatus((req as any).user!.tenantId);
    res.json({
      ...status,
      licenseValidNow: TenantCapacityService.isLicenseCurrentlyValid(status),
    });
  } catch (error) {
    next(error);
  }
});

networkRouter.put('/runtime-capacity', async (req, res, next) => {
  try {
    const data = updateRuntimeCapacitySchema.parse(req.body);
    const status = await TenantCapacityService.updateSettings((req as any).user!.tenantId, data);
    await logAudit({
      tenantId: (req as any).user!.tenantId,
      userId: (req as any).user!.userId,
      action: 'runtime_capacity_updated',
      resource: 'tenant:runtime_capacity',
      detail: {
        maxConcurrentProfiles: data.maxConcurrentProfiles,
        rateLimitPerSeatPerMinute: data.rateLimitPerSeatPerMinute,
        licenseEnforced: data.licenseEnforced,
        licenseActive: data.licenseActive,
        licenseExpiresAt: data.licenseExpiresAt,
        hasLicenseKey: typeof data.licenseKey === 'string' && data.licenseKey.length > 0,
      }
    });
    res.json({
      ...status,
      licenseValidNow: TenantCapacityService.isLicenseCurrentlyValid(status),
    });
  } catch (error) {
    next(error);
  }
});

networkRouter.get('/sandbox-automation', async (req, res, next) => {
  try {
    const settings = await SandboxAutomationService.getSettings((req as any).user!.tenantId);
    const recent = await SandboxAutomationService.listRecent((req as any).user!.tenantId);
    res.json({ settings, recent });
  } catch (error) {
    next(error);
  }
});

networkRouter.put('/sandbox-automation', async (req, res, next) => {
  try {
    const data = updateSandboxAutomationSchema.parse(req.body);
    const settings = await SandboxAutomationService.updateSettings((req as any).user!.tenantId, data);
    await logAudit({
      tenantId: (req as any).user!.tenantId,
      userId: (req as any).user!.userId,
      action: 'sandbox_automation_updated',
      resource: 'tenant:sandbox_automation',
      detail: data,
    });
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

networkRouter.get('/sandbox-runtime-emulation', async (req, res, next) => {
  try {
    const settings = await SandboxRuntimeEmulationService.getSettings((req as any).user!.tenantId);
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

networkRouter.put('/sandbox-runtime-emulation', async (req, res, next) => {
  try {
    const data = updateSandboxRuntimeEmulationSchema.parse(req.body);
    const settings = await SandboxRuntimeEmulationService.updateSettings((req as any).user!.tenantId, data);
    await logAudit({
      tenantId: (req as any).user!.tenantId,
      userId: (req as any).user!.userId,
      action: 'sandbox_runtime_emulation_updated',
      resource: 'tenant:sandbox_runtime_emulation',
      detail: settings,
    });
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

networkRouter.post('/sandbox-automation/challenges', async (req, res, next) => {
  try {
    const data = issueSandboxChallengeSchema.parse(req.body);
    const challenge = await SandboxAutomationService.issueChallenge(
      (req as any).user!.tenantId,
      data.type,
      data.prompt,
      data.payload
    );
    await logAudit({
      tenantId: (req as any).user!.tenantId,
      userId: (req as any).user!.userId,
      action: 'sandbox_challenge_issued',
      resource: `sandbox:${challenge.type}:${challenge.id}`,
      detail: { provider: challenge.provider, prompt: data.prompt }
    });
    res.status(201).json(challenge);
  } catch (error) {
    next(error);
  }
});

networkRouter.post('/sandbox-automation/challenges/:id/resolve', async (req, res, next) => {
  try {
    const data = resolveSandboxChallengeSchema.parse(req.body);
    const challenge = await SandboxAutomationService.resolveChallenge(
      (req as any).user!.tenantId,
      req.params.id,
      data.resolution
    );
    await logAudit({
      tenantId: (req as any).user!.tenantId,
      userId: (req as any).user!.userId,
      action: 'sandbox_challenge_resolved',
      resource: `sandbox:${challenge.type}:${challenge.id}`,
      detail: { resolutionKeys: Object.keys(data.resolution) }
    });
    res.json(challenge);
  } catch (error) {
    next(error);
  }
});

networkRouter.post('/selector-assist', async (req, res, next) => {
  try {
    const data = selectorAssistSchema.parse(req.body);
    const result = SelectorAssistService.analyzeSnapshot(data.snapshot, {
      label: data.label,
      controlKind: data.controlKind,
      localeHints: data.localeHints,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

networkRouter.get('/sandbox-lab', async (req, res, next) => {
  try {
    const result = await SandboxCompatibilityLabService.evaluateAll((req as any).user!.tenantId);
    const history = await SandboxCompatibilityLabService.getHistory((req as any).user!.tenantId);
    res.json({ ...result, history });
  } catch (error) {
    next(error);
  }
});

networkRouter.post('/sandbox-lab/run', async (req, res, next) => {
  try {
    const record = await SandboxCompatibilityLabService.runRegressionSuite((req as any).user!.tenantId);
    await logAudit({
      tenantId: (req as any).user!.tenantId,
      userId: (req as any).user!.userId,
      action: 'sandbox_lab_regression_run',
      resource: `sandbox_lab_run:${record.id}`,
      detail: record.summary,
    });
    res.status(201).json(record);
  } catch (error) {
    next(error);
  }
});

networkRouter.post('/sandbox-lab/scenarios', async (req, res, next) => {
  try {
    const data = sandboxScenarioSchema.parse(req.body);
    const scenario = await SandboxCompatibilityLabService.saveScenario((req as any).user!.tenantId, data);
    await logAudit({
      tenantId: (req as any).user!.tenantId,
      userId: (req as any).user!.userId,
      action: 'sandbox_scenario_saved',
      resource: `sandbox_lab:${scenario.id}`,
      detail: { name: scenario.name, version: scenario.version, stage: scenario.stage }
    });
    res.status(201).json(scenario);
  } catch (error) {
    next(error);
  }
});

networkRouter.delete('/sandbox-lab/scenarios/:id', async (req, res, next) => {
  try {
    await SandboxCompatibilityLabService.deleteScenario((req as any).user!.tenantId, req.params.id);
    await logAudit({
      tenantId: (req as any).user!.tenantId,
      userId: (req as any).user!.userId,
      action: 'sandbox_scenario_deleted',
      resource: `sandbox_lab:${req.params.id}`,
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
