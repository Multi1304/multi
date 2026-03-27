import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { config } from '../config';
import { prisma } from '../prisma';
import { RuntimeEnvironmentMode, RuntimeEnvironmentService } from './runtimeEnvironment.service';

export interface ProfileConsistencySettings {
  enabled: boolean;
  windowDays: number;
  enforceFingerprint: boolean;
  enforceStickyProxy: boolean;
}

export interface ProfileConsistencySummary {
  enabled: boolean;
  status: 'inactive' | 'initialized' | 'pinned' | 'drifted';
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  stickyUntil: string | null;
  driftCount: number;
  endpointId: string | null;
  fingerprintHash: string | null;
}

interface StoredProfileConsistencyRecord {
  profileId: string;
  tenantId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  stickyUntil: string;
  driftCount: number;
  endpointId: string | null;
  lastDriftAt: string | null;
  fingerprintHash: string | null;
  fingerprintSnapshot: any | null;
}

interface ProfileConsistencyAdapter {
  stabilizeFingerprint(profileId: string, tenantId: string, fingerprint?: any): Promise<{ fingerprint: any; summary: ProfileConsistencySummary }>;
  observeRuntime(profileId: string, tenantId: string, fingerprint?: any, proxy?: any): Promise<ProfileConsistencySummary>;
  getStickyTtlSeconds(tenantId: string): Promise<number>;
  getSummary(profileId: string, tenantId: string): Promise<ProfileConsistencySummary>;
}

const DEFAULT_SETTINGS: ProfileConsistencySettings = {
  enabled: true,
  windowDays: 14,
  enforceFingerprint: true,
  enforceStickyProxy: true,
};

class SandboxProfileConsistencyAdapter implements ProfileConsistencyAdapter {
  async stabilizeFingerprint(_profileId: string, _tenantId: string, fingerprint?: any) {
    return { fingerprint, summary: emptySummary(false) };
  }

  async observeRuntime(_profileId: string, _tenantId: string, _fingerprint?: any, proxy?: any) {
    return {
      ...emptySummary(false),
      endpointId: proxy?.__session?.endpointId || null,
    };
  }

  async getStickyTtlSeconds() {
    return 7 * 24 * 60 * 60;
  }

  async getSummary() {
    return emptySummary(false);
  }
}

class ProductionProfileConsistencyAdapter implements ProfileConsistencyAdapter {
  async stabilizeFingerprint(profileId: string, tenantId: string, fingerprint?: any) {
    const settings = await getSettings(tenantId);
    if (!settings.enabled || !fingerprint) {
      return { fingerprint, summary: emptySummary(settings.enabled) };
    }

    const record = await loadRecord(profileId);
    if (!record || record.tenantId !== tenantId || isExpired(record)) {
      const created = await upsertRecord(profileId, tenantId, fingerprint, null, settings, record);
      return { fingerprint, summary: summarize(created, settings) };
    }

    if (settings.enforceFingerprint && record.fingerprintSnapshot) {
      const mergedFingerprint = {
        ...fingerprint,
        ...record.fingerprintSnapshot,
        productionMode: fingerprint?.productionMode ?? record.fingerprintSnapshot?.productionMode ?? true,
        runtimeEnvironment: fingerprint?.runtimeEnvironment || record.fingerprintSnapshot?.runtimeEnvironment || 'production',
      };
      return {
        fingerprint: mergedFingerprint,
        summary: summarize(record, settings, hashFingerprint(fingerprint) !== record.fingerprintHash ? 'pinned' : 'initialized'),
      };
    }

    return { fingerprint, summary: summarize(record, settings) };
  }

  async observeRuntime(profileId: string, tenantId: string, fingerprint?: any, proxy?: any) {
    const settings = await getSettings(tenantId);
    if (!settings.enabled) return emptySummary(false);
    const record = await upsertRecord(profileId, tenantId, fingerprint, proxy, settings, await loadRecord(profileId));
    return summarize(record, settings);
  }

  async getStickyTtlSeconds(tenantId: string) {
    const settings = await getSettings(tenantId);
    return Math.max(1, settings.windowDays) * 24 * 60 * 60;
  }

  async getSummary(profileId: string, tenantId: string) {
    const settings = await getSettings(tenantId);
    return summarize(await loadRecord(profileId), settings);
  }
}

const sandboxAdapter = new SandboxProfileConsistencyAdapter();
const productionAdapter = new ProductionProfileConsistencyAdapter();

export class ProfileConsistencyService {
  static async stabilizeFingerprint(profileId: string, tenantId: string, fingerprint?: any, environment?: RuntimeEnvironmentMode) {
    const adapter = await this.getAdapter(tenantId, environment);
    return adapter.stabilizeFingerprint(profileId, tenantId, fingerprint);
  }

  static async observeRuntime(profileId: string, tenantId: string, fingerprint?: any, proxy?: any, environment?: RuntimeEnvironmentMode) {
    const adapter = await this.getAdapter(tenantId, environment);
    return adapter.observeRuntime(profileId, tenantId, fingerprint, proxy);
  }

  static async getStickyTtlSeconds(tenantId: string, environment?: RuntimeEnvironmentMode) {
    const adapter = await this.getAdapter(tenantId, environment);
    return adapter.getStickyTtlSeconds(tenantId);
  }

  static async getSummary(profileId: string, tenantId: string, environment?: RuntimeEnvironmentMode) {
    const adapter = await this.getAdapter(tenantId, environment);
    return adapter.getSummary(profileId, tenantId);
  }

  private static async getAdapter(tenantId?: string | null, environment?: RuntimeEnvironmentMode) {
    const resolved = await RuntimeEnvironmentService.resolve({ tenantId, explicitMode: environment });
    return resolved === 'sandbox' ? sandboxAdapter : productionAdapter;
  }
}

async function getSettings(tenantId: string): Promise<ProfileConsistencySettings> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true },
  }).catch(() => null);

  const raw = (tenant?.settings as any)?.profileConsistency || {};
  return {
    enabled: raw.enabled !== false,
    windowDays: Math.max(1, Number(raw.windowDays || DEFAULT_SETTINGS.windowDays)),
    enforceFingerprint: raw.enforceFingerprint !== false,
    enforceStickyProxy: raw.enforceStickyProxy !== false,
  };
}

function consistencyPath(profileId: string) {
  return path.resolve(config.profileStateDir, 'consistency', `${profileId}.json`);
}

async function loadRecord(profileId: string): Promise<StoredProfileConsistencyRecord | null> {
  try {
    const raw = await fs.readFile(consistencyPath(profileId), 'utf8');
    return JSON.parse(raw) as StoredProfileConsistencyRecord;
  } catch {
    return null;
  }
}

async function saveRecord(profileId: string, record: StoredProfileConsistencyRecord) {
  const target = consistencyPath(profileId);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(record, null, 2), 'utf8');
}

function hashFingerprint(fingerprint?: any) {
  if (!fingerprint) return null;
  const normalized = {
    userAgent: fingerprint?.userAgent || null,
    language: fingerprint?.language || null,
    timezone: fingerprint?.timezoneId || fingerprint?.timezone || null,
    platform: fingerprint?.platformOS || fingerprint?.platform || null,
    hardwareConcurrency: fingerprint?.hardwareConcurrency || null,
    deviceMemory: fingerprint?.deviceMemory || null,
    screenResolution: fingerprint?.screenResolution || null,
    webglVendor: fingerprint?.webgl?.vendor || fingerprint?.webglVendor || null,
    webglRenderer: fingerprint?.webgl?.renderer || fingerprint?.webglRenderer || null,
  };
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function isExpired(record: StoredProfileConsistencyRecord) {
  return new Date(record.stickyUntil).getTime() <= Date.now();
}

async function upsertRecord(profileId: string, tenantId: string, fingerprint: any, proxy: any, settings: ProfileConsistencySettings, current: StoredProfileConsistencyRecord | null) {
  const now = new Date();
  const stickyUntil = new Date(now.getTime() + settings.windowDays * 24 * 60 * 60 * 1000).toISOString();
  const nextFingerprintHash = hashFingerprint(fingerprint);
  const nextEndpointId = proxy?.__session?.endpointId || current?.endpointId || null;

  const drifted = Boolean(
    current &&
    (
      (settings.enforceFingerprint && current.fingerprintHash && nextFingerprintHash && current.fingerprintHash !== nextFingerprintHash) ||
      (settings.enforceStickyProxy && current.endpointId && nextEndpointId && current.endpointId !== nextEndpointId && !isExpired(current))
    )
  );

  const record: StoredProfileConsistencyRecord = {
    profileId,
    tenantId,
    firstSeenAt: current?.firstSeenAt || now.toISOString(),
    lastSeenAt: now.toISOString(),
    stickyUntil,
    driftCount: current?.driftCount || 0,
    endpointId: nextEndpointId,
    lastDriftAt: current?.lastDriftAt || null,
    fingerprintHash: current?.fingerprintHash || nextFingerprintHash,
    fingerprintSnapshot: current?.fingerprintSnapshot || fingerprint || null,
  };

  if (drifted) {
    record.driftCount += 1;
    record.lastDriftAt = now.toISOString();
  }

  await saveRecord(profileId, record);
  return record;
}

function emptySummary(enabled: boolean): ProfileConsistencySummary {
  return {
    enabled,
    status: 'inactive',
    firstSeenAt: null,
    lastSeenAt: null,
    stickyUntil: null,
    driftCount: 0,
    endpointId: null,
    fingerprintHash: null,
  };
}

function summarize(record: StoredProfileConsistencyRecord | null, settings: ProfileConsistencySettings, forcedStatus?: ProfileConsistencySummary['status']): ProfileConsistencySummary {
  if (!record) return emptySummary(settings.enabled);
  return {
    enabled: settings.enabled,
    status: forcedStatus || (record.driftCount > 0 ? 'drifted' : 'initialized'),
    firstSeenAt: record.firstSeenAt,
    lastSeenAt: record.lastSeenAt,
    stickyUntil: record.stickyUntil,
    driftCount: record.driftCount,
    endpointId: record.endpointId,
    fingerprintHash: record.fingerprintHash,
  };
}
