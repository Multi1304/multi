import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';
import { redis } from '../utils/redis';
import { ScaleMetricsService } from './scaleMetrics.service';
import { ProfileEncryptionService } from './profileEncryption.service';
import { ProfileConsistencyService } from './profileConsistency.service';

export interface ProfileSnapshotManifest {
  snapshotId: string;
  profileId: string;
  trigger: string;
  createdAt: string;
  sourceVersion: number;
  fileCount: number;
  checksum: string;
  metadata?: Record<string, any>;
}

export interface ProfileSyncManifest {
  profileId: string;
  version: number;
  updatedAt: string;
  checksum: string;
  owner: string;
  source: 'local' | 'cloud';
  fileCount: number;
  lastSnapshotId?: string | null;
  files?: Array<{
    path: string;
    size: number;
    mtimeMs: number;
    checksum: string;
  }>;
}

export interface ProfileStateDiffSummary {
  status: 'empty' | 'in_sync' | 'local_only' | 'cloud_only' | 'diverged' | 'local_ahead' | 'cloud_ahead';
  checksumMatch: boolean;
  versionDelta: number;
  localOnlyCount: number;
  cloudOnlyCount: number;
  changedCount: number;
  sampleLocalOnly: string[];
  sampleCloudOnly: string[];
  sampleChanged: string[];
}

export interface ProfileStateAuditEntry {
  id: string;
  profileId: string;
  at: string;
  action: string;
  actor: string;
  details?: Record<string, any>;
}

export interface SnapshotDiffResult {
  snapshotId: string;
  target: 'live' | 'cloud';
  snapshotChecksum: string;
  targetChecksum: string | null;
  diff: ProfileStateDiffSummary;
}

export interface ProfileRuntimeLeaseInfo {
  locked: boolean;
  owner: string | null;
  tokenPreview: string | null;
  acquiredAt: string | null;
  expiresInMs: number | null;
  expiresAt: string | null;
}

export class ProfileStateService {
  private static readonly LOCK_TTL_MS = 2 * 60 * 1000;
  private static readonly STALE_RUNTIME_LEASE_GRACE_MS = 15 * 1000;

  private static liveDir(profileId: string) {
    return path.join(config.profilesDir, profileId);
  }

  private static stateDir(profileId: string) {
    return path.join(config.profileStateDir, profileId);
  }

  private static snapshotsDir(profileId: string) {
    return path.join(this.stateDir(profileId), 'snapshots');
  }

  private static syncManifestPath(profileId: string) {
    return path.join(this.stateDir(profileId), 'sync-manifest.json');
  }

  private static cloudDir(profileId: string) {
    return path.join(config.profileSyncDir, profileId);
  }

  private static cloudManifestPath(profileId: string) {
    return path.join(this.cloudDir(profileId), 'manifest.json');
  }

  private static auditLogPath(profileId: string) {
    return path.join(this.stateDir(profileId), 'activity-log.json');
  }

  private static lockKey(profileId: string, purpose: string) {
    return `v3:profile:lock:${profileId}:${purpose}`;
  }

  private static activeProfilePattern(profileId: string) {
    return `v3:tenant:active-profile:*:${profileId}`;
  }

  static async ensureProfileScaffold(profileId: string) {
    await Promise.all([
      fs.ensureDir(this.liveDir(profileId)),
      fs.ensureDir(this.snapshotsDir(profileId)),
      fs.ensureDir(this.cloudDir(profileId)),
    ]);
  }

  static async listSnapshots(profileId: string): Promise<ProfileSnapshotManifest[]> {
    await this.ensureProfileScaffold(profileId);
    const root = this.snapshotsDir(profileId);
    const entries = await fs.readdir(root).catch(() => []);
    const manifests = await Promise.all(
      entries.map(async (snapshotId) => {
        const manifestPath = path.join(root, snapshotId, 'manifest.json');
        if (!(await fs.pathExists(manifestPath))) return null;
        return await fs.readJson(manifestPath).catch(() => null);
      })
    );

    return manifests
      .filter(Boolean)
      .sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  static async createSnapshot(profileId: string, trigger = 'manual', metadata?: Record<string, any>) {
    await this.ensureProfileScaffold(profileId);

    return await this.withLock(profileId, 'snapshot', async () => {
      const snapshotId = new Date().toISOString().replace(/[:.]/g, '-');
      const liveDir = this.liveDir(profileId);
      const snapshotRoot = path.join(this.snapshotsDir(profileId), snapshotId);
      const payloadDir = path.join(snapshotRoot, 'payload');

      await fs.ensureDir(payloadDir);
      await this.copyDirectoryContents(liveDir, payloadDir);

      const [sourceManifest, fingerprint] = await Promise.all([
        this.readSyncManifest(profileId),
        this.safeReadJson(path.join(liveDir, 'storage-state.json')),
      ]);
      const fileCount = await this.countFiles(payloadDir);
      const checksum = await this.computeDirectoryChecksum(payloadDir);

      const manifest: ProfileSnapshotManifest = {
        snapshotId,
        profileId,
        trigger,
        createdAt: new Date().toISOString(),
        sourceVersion: sourceManifest?.version || 0,
        fileCount,
        checksum,
        metadata: {
          ...metadata,
          hasStorageState: !!fingerprint,
        },
      };

      await fs.writeJson(path.join(snapshotRoot, 'manifest.json'), manifest, { spaces: 2 });
      await this.writeSyncManifest(profileId, {
        profileId,
        version: Math.max(1, (sourceManifest?.version || 0)),
        updatedAt: new Date().toISOString(),
        checksum,
        owner: config.worker.id,
        source: 'local',
        fileCount,
        lastSnapshotId: snapshotId,
        files: await this.buildFileInventory(payloadDir),
      });
      await this.appendAuditEntry(profileId, 'snapshot.created', {
        trigger,
        snapshotId,
        fileCount,
        checksum,
        metadata,
      });
      await ScaleMetricsService.recordProfileSync('snapshot');
      return manifest;
    });
  }

  static async restoreSnapshot(profileId: string, snapshotId: string, metadata?: Record<string, any>) {
    await this.ensureProfileScaffold(profileId);

    return await this.withLock(profileId, 'restore', async () => {
      const snapshotRoot = path.join(this.snapshotsDir(profileId), snapshotId);
      const payloadDir = path.join(snapshotRoot, 'payload');
      const manifestPath = path.join(snapshotRoot, 'manifest.json');

      if (!(await fs.pathExists(payloadDir)) || !(await fs.pathExists(manifestPath))) {
        throw new Error(`Snapshot ${snapshotId} not found for profile ${profileId}`);
      }

      const liveDir = this.liveDir(profileId);
      const liveEntries = await fs.readdir(liveDir).catch(() => []);
      if (liveEntries.length > 0) {
        await this.createSnapshot(profileId, 'pre-restore-backup', {
          restoreTarget: snapshotId,
          ...metadata,
        });
      }

      await this.clearDirectoryContents(liveDir);
      await this.copyDirectoryContents(payloadDir, liveDir);

      const restoredManifest = await fs.readJson(manifestPath) as ProfileSnapshotManifest;
      const fileCount = await this.countFiles(liveDir);
      const checksum = await this.computeDirectoryChecksum(liveDir);

      await this.writeSyncManifest(profileId, {
        profileId,
        version: Math.max(1, restoredManifest.sourceVersion),
        updatedAt: new Date().toISOString(),
        checksum,
        owner: config.worker.id,
        source: 'local',
        fileCount,
        lastSnapshotId: snapshotId,
        files: await this.buildFileInventory(liveDir),
      });

      await this.appendAuditEntry(profileId, 'snapshot.restored', {
        snapshotId,
        fileCount,
        checksum,
        metadata,
      });
      await ScaleMetricsService.recordProfileSync('restore');
      return {
        restoredFrom: snapshotId,
        checksum,
        fileCount,
      };
    });
  }

  static async uploadToCloud(profileId: string) {
    await this.ensureProfileScaffold(profileId);
    return await this.withLock(profileId, 'sync', async () => {
      const liveDir = this.liveDir(profileId);
      const cloudDir = this.cloudDir(profileId);

      await fs.ensureDir(cloudDir);

      const localManifest = await this.readSyncManifest(profileId);
      const fileInventory = await this.buildFileInventory(liveDir);
      await this.syncDirectoryDelta(liveDir, cloudDir, localManifest?.files || [], fileInventory, ['manifest.json']);
      const fileCount = fileInventory.length;
      const checksum = this.computeInventoryChecksum(fileInventory);
      const manifest: ProfileSyncManifest = {
        profileId,
        version: (localManifest?.version || 0) + 1,
        updatedAt: new Date().toISOString(),
        checksum,
        owner: config.worker.id,
        source: 'cloud',
        fileCount,
        lastSnapshotId: localManifest?.lastSnapshotId || null,
        files: fileInventory,
      };

      await fs.writeJson(this.cloudManifestPath(profileId), manifest, { spaces: 2 });
      await this.writeSyncManifest(profileId, {
        ...manifest,
        source: 'local',
      });
      await this.appendAuditEntry(profileId, 'sync.uploaded', {
        version: manifest.version,
        fileCount,
        checksum,
      });
      await ScaleMetricsService.recordProfileSync('upload');
      return manifest;
    });
  }

  static async downloadFromCloud(profileId: string) {
    await this.ensureProfileScaffold(profileId);
    return await this.withLock(profileId, 'sync', async () => {
      const cloudManifest = await this.readCloudManifest(profileId);
      if (!cloudManifest) {
        return null;
      }

      const localManifest = await this.readSyncManifest(profileId);
      if (localManifest && localManifest.version >= cloudManifest.version && localManifest.checksum === cloudManifest.checksum) {
        return localManifest;
      }

      const liveDir = this.liveDir(profileId);
      const cloudDir = this.cloudDir(profileId);
      const localFiles = await this.buildFileInventory(liveDir);
      await this.syncDirectoryDelta(cloudDir, liveDir, localFiles, cloudManifest.files || [], ['manifest.json']);

      const fileCount = cloudManifest.files?.length || await this.countFiles(liveDir);
      await this.writeSyncManifest(profileId, {
        ...cloudManifest,
        source: 'local',
        fileCount,
      });
      await this.appendAuditEntry(profileId, 'sync.downloaded', {
        version: cloudManifest.version,
        fileCount,
        checksum: cloudManifest.checksum,
      });
      await ScaleMetricsService.recordProfileSync('download');
      return cloudManifest;
    });
  }

  static async hasCloudState(profileId: string) {
    return await fs.pathExists(this.cloudManifestPath(profileId));
  }

  static async getStateSummary(profileId: string, tenantId?: string | null) {
    const [localManifest, cloudManifest, snapshots, runtimeLease, sessionSnapshot, encryption, consistency] = await Promise.all([
      this.readSyncManifest(profileId),
      this.readCloudManifest(profileId),
      this.listSnapshots(profileId),
      this.getRuntimeLeaseInfo(profileId),
      this.readSessionSnapshot(profileId),
      tenantId ? ProfileEncryptionService.getSummary(profileId, tenantId) : null,
      tenantId ? ProfileConsistencyService.getSummary(profileId, tenantId) : null,
    ]);
    const diff = this.computeManifestDiff(localManifest, cloudManifest);
    const activity = await this.readAuditTrail(profileId, 20);

    return {
      profileId,
      localManifest,
      cloudManifest,
      diff,
      activity,
      runtimeLease,
      sessionSnapshot,
      encryption,
      consistency,
      snapshots: snapshots.slice(0, 10),
    };
  }

  static async getSnapshotDiff(profileId: string, snapshotId: string, target: 'live' | 'cloud' = 'live'): Promise<SnapshotDiffResult> {
    await this.ensureProfileScaffold(profileId);
    const snapshotRoot = path.join(this.snapshotsDir(profileId), snapshotId);
    const payloadDir = path.join(snapshotRoot, 'payload');
    const manifestPath = path.join(snapshotRoot, 'manifest.json');

    if (!(await fs.pathExists(payloadDir)) || !(await fs.pathExists(manifestPath))) {
      throw new Error(`Snapshot ${snapshotId} not found for profile ${profileId}`);
    }

    const snapshotManifest = await fs.readJson(manifestPath) as ProfileSnapshotManifest;
    const snapshotFiles = await this.buildFileInventory(payloadDir);
    const snapshotSync: ProfileSyncManifest = {
      profileId,
      version: snapshotManifest.sourceVersion || 0,
      updatedAt: snapshotManifest.createdAt,
      checksum: snapshotManifest.checksum,
      owner: 'snapshot',
      source: 'local',
      fileCount: snapshotManifest.fileCount,
      lastSnapshotId: snapshotId,
      files: snapshotFiles,
    };

    let targetManifest: ProfileSyncManifest | null = null;
    if (target === 'live') {
      targetManifest = await this.readSyncManifest(profileId);
      if (!targetManifest) {
        const files = await this.buildFileInventory(this.liveDir(profileId));
        targetManifest = {
          profileId,
          version: 0,
          updatedAt: new Date().toISOString(),
          checksum: this.computeInventoryChecksum(files),
          owner: 'live',
          source: 'local',
          fileCount: files.length,
          lastSnapshotId: null,
          files,
        };
      }
    } else {
      targetManifest = await this.readCloudManifest(profileId);
      if (!targetManifest && await fs.pathExists(this.cloudDir(profileId))) {
        const files = await this.buildFileInventory(this.cloudDir(profileId));
        targetManifest = {
          profileId,
          version: 0,
          updatedAt: new Date().toISOString(),
          checksum: this.computeInventoryChecksum(files),
          owner: 'cloud',
          source: 'cloud',
          fileCount: files.length,
          lastSnapshotId: null,
          files,
        };
      }
    }

    return {
      snapshotId,
      target,
      snapshotChecksum: snapshotManifest.checksum,
      targetChecksum: targetManifest?.checksum || null,
      diff: this.computeManifestDiff(snapshotSync, targetManifest),
    };
  }

  static async rebuildLocalManifest(profileId: string, source: 'local' | 'cloud' = 'local') {
    await this.ensureProfileScaffold(profileId);
    const liveDir = this.liveDir(profileId);
    const files = await this.buildFileInventory(liveDir);
    const manifest: ProfileSyncManifest = {
      profileId,
      version: Math.max(1, (await this.readSyncManifest(profileId))?.version || 1),
      updatedAt: new Date().toISOString(),
      checksum: this.computeInventoryChecksum(files),
      owner: config.worker.id,
      source,
      fileCount: files.length,
      lastSnapshotId: (await this.readSyncManifest(profileId))?.lastSnapshotId || null,
      files,
    };
    await this.writeSyncManifest(profileId, manifest);
    await this.appendAuditEntry(profileId, 'manifest.rebuilt', {
      source,
      version: manifest.version,
      checksum: manifest.checksum,
      fileCount: manifest.fileCount,
    });
    return manifest;
  }

  static async pullFromCloud(profileId: string, metadata?: Record<string, any>) {
    const manifest = await this.downloadFromCloud(profileId);
    await this.appendAuditEntry(profileId, 'sync.pulled', {
      metadata,
      version: manifest?.version || null,
      checksum: manifest?.checksum || null,
      fileCount: manifest?.fileCount || 0,
    });
    return manifest;
  }

  static async getRuntimeLeaseInfo(profileId: string): Promise<ProfileRuntimeLeaseInfo> {
    const key = this.lockKey(profileId, 'runtime');
    const token = await redis.get(key);
    if (!token) {
      return {
        locked: false,
        owner: null,
        tokenPreview: null,
        acquiredAt: null,
        expiresInMs: null,
        expiresAt: null,
      };
    }

    const ttl = await redis.pttl(key);
    return this.buildRuntimeLeaseInfo(token, ttl);
  }

  static async acquireRuntimeLease(profileId: string, owner = config.worker.id) {
    const token = `${owner}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const key = this.lockKey(profileId, 'runtime');
    let ok = await redis.set(key, token, 'PX', this.LOCK_TTL_MS, 'NX');

    if (ok !== 'OK') {
      const reclaimed = await this.reapSingleStaleRuntimeLease(profileId, {
        requestedBy: owner,
        trigger: 'acquire_conflict',
      });

      if (reclaimed) {
        ok = await redis.set(key, token, 'PX', this.LOCK_TTL_MS, 'NX');
      }
    }

    if (ok !== 'OK') {
      const lease = await this.getRuntimeLeaseInfo(profileId);
      await ScaleMetricsService.recordProfileSync('lock_conflict');
      const leaseSuffix = lease.owner
        ? ` (owner: ${lease.owner}${lease.expiresInMs !== null ? `, retry in ~${Math.max(1, Math.ceil(lease.expiresInMs / 1000))}s` : ''})`
        : '';
      throw new Error(`Profile ${profileId} is already leased by another runtime instance${leaseSuffix}`);
    }
    return token;
  }

  static async refreshRuntimeLease(profileId: string, token: string) {
    const key = this.lockKey(profileId, 'runtime');
    const current = await redis.get(key);
    if (current !== token) return false;
    await redis.pexpire(key, this.LOCK_TTL_MS);
    return true;
  }

  static async releaseRuntimeLease(profileId: string, token: string) {
    const key = this.lockKey(profileId, 'runtime');
    await this.releaseLockKey(key, token);
  }

  static async forceReleaseRuntimeLease(profileId: string, metadata?: Record<string, any>) {
    const key = this.lockKey(profileId, 'runtime');
    const token = await redis.get(key);
    if (!token) {
      return {
        released: false,
        reason: 'not_locked',
      };
    }

    await redis.del(key);
    await this.appendAuditEntry(profileId, 'runtime.lease.force_released', {
      previousOwner: token.split(':')[0] || null,
      metadata,
    });

    return {
      released: true,
      previousOwner: token.split(':')[0] || null,
    };
  }

  static async forceTakeoverRuntimeLease(profileId: string, owner = config.worker.id, metadata?: Record<string, any>) {
    const key = this.lockKey(profileId, 'runtime');
    const previousToken = await redis.get(key);
    const token = `${owner}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    await redis.set(key, token, 'PX', this.LOCK_TTL_MS);
    await this.appendAuditEntry(profileId, 'runtime.lease.force_taken_over', {
      previousOwner: previousToken?.split(':')[0] || null,
      nextOwner: owner,
      metadata,
    });
    const ttl = await redis.pttl(key);
    return {
      token,
      lease: this.buildRuntimeLeaseInfo(token, ttl),
      previousOwner: previousToken?.split(':')[0] || null,
    };
  }

  static async forceReleaseDevelopmentRuntimeLeases(metadata?: Record<string, any>) {
    const pattern = this.lockKey('*', 'runtime');
    let cursor = '0';
    let scanned = 0;
    const released: Array<{ profileId: string; owner: string | null }> = [];

    do {
      const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = result[0];
      const keys = result[1] || [];
      scanned += keys.length;

      for (const key of keys) {
        const match = key.match(/^v3:profile:lock:(.+):runtime$/);
        const profileId = match?.[1];
        if (!profileId) continue;

        const token = await redis.get(key);
        const owner = token?.split(':')[0] || null;
        if (!owner || !/^worker-\d+$/i.test(owner)) {
          continue;
        }

        await redis.del(key);
        await this.clearActiveProfileMarkers(profileId);
        await this.appendAuditEntry(profileId, 'runtime.lease.dev_force_released', {
          previousOwner: owner,
          metadata,
        });

        released.push({ profileId, owner });
      }
    } while (cursor !== '0');

    return {
      scanned,
      released,
    };
  }

  static async reapStaleRuntimeLeases(metadata?: Record<string, any>) {
    const pattern = this.lockKey('*', 'runtime');
    let cursor = '0';
    let scanned = 0;
    const released: Array<{ profileId: string; owner: string | null }> = [];

    do {
      const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = result[0];
      const keys = result[1] || [];
      scanned += keys.length;

      for (const key of keys) {
        const match = key.match(/^v3:profile:lock:(.+):runtime$/);
        const profileId = match?.[1];
        if (!profileId) continue;

        const reclaimed = await this.reapSingleStaleRuntimeLease(profileId, {
          ...metadata,
          trigger: metadata?.trigger || 'background-reaper',
        });

        if (reclaimed) {
          released.push({
            profileId,
            owner: reclaimed.owner,
          });
        }
      }
    } while (cursor !== '0');

    return {
      scanned,
      released,
    };
  }

  private static async withLock<T>(profileId: string, purpose: string, work: () => Promise<T>) {
    const lockValue = `${config.worker.id}:${purpose}:${Date.now()}`;
    const key = this.lockKey(profileId, purpose);
    const acquired = await redis.set(key, lockValue, 'PX', this.LOCK_TTL_MS, 'NX');
    if (acquired !== 'OK') {
      await ScaleMetricsService.recordProfileSync('lock_conflict');
      throw new Error(`Profile ${profileId} is busy for ${purpose}`);
    }

    try {
      return await work();
    } finally {
      await this.releaseLockKey(key, lockValue);
    }
  }

  private static async releaseLockKey(key: string, token: string) {
    const script = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      end
      return 0
    `;

    try {
      await redis.eval(script, 1, key, token);
    } catch (error: any) {
      logger.warn('Profile lock release failed', { key, error: error?.message });
    }
  }

  private static async hasAnyActiveProfileMarker(profileId: string) {
    const pattern = this.activeProfilePattern(profileId);
    let cursor = '0';

    do {
      const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 20);
      cursor = result[0];
      if ((result[1] || []).length > 0) {
        return true;
      }
    } while (cursor !== '0');

    return false;
  }

  private static async clearActiveProfileMarkers(profileId: string) {
    const pattern = this.activeProfilePattern(profileId);
    let cursor = '0';

    do {
      const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 20);
      cursor = result[0];
      const keys = result[1] || [];
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  }

  private static async reapSingleStaleRuntimeLease(profileId: string, metadata?: Record<string, any>) {
    const key = this.lockKey(profileId, 'runtime');
    const token = await redis.get(key);
    if (!token) return null;

    const ttl = await redis.pttl(key);
    const lease = this.buildRuntimeLeaseInfo(token, ttl);
    const activeRuntime = await this.hasAnyActiveProfileMarker(profileId);
    const acquiredAtMs = lease.acquiredAt ? Date.parse(lease.acquiredAt) : 0;
    const ageMs = acquiredAtMs > 0 ? Date.now() - acquiredAtMs : null;
    const looksStale = !activeRuntime && (
      ttl <= 0 ||
      ageMs === null ||
      ageMs >= this.STALE_RUNTIME_LEASE_GRACE_MS
    );

    if (!looksStale) {
      return null;
    }

    await this.releaseLockKey(key, token);
    const current = await redis.get(key);
    if (current) {
      return null;
    }

    await this.appendAuditEntry(profileId, 'runtime.lease.auto_released', {
      previousOwner: lease.owner,
      ageMs,
      expiresInMs: lease.expiresInMs,
      metadata,
    });

    return lease;
  }

  private static buildRuntimeLeaseInfo(token: string, ttlMs: number): ProfileRuntimeLeaseInfo {
    const [owner, acquiredAtRaw] = token.split(':');
    const acquiredAtMs = Number(acquiredAtRaw || 0);
    const expiresInMs = ttlMs >= 0 ? ttlMs : null;
    const acquiredAt = acquiredAtMs > 0 ? new Date(acquiredAtMs).toISOString() : null;
    const expiresAt = acquiredAtMs > 0 && expiresInMs !== null
      ? new Date(Date.now() + expiresInMs).toISOString()
      : null;

    return {
      locked: true,
      owner: owner || null,
      tokenPreview: token.slice(0, 18),
      acquiredAt,
      expiresInMs,
      expiresAt,
    };
  }

  private static async readSessionSnapshot(profileId: string) {
    const snapshotPath = path.resolve(process.cwd(), 'logs', 'profile-sessions', `${profileId}.json`);
    return await this.safeReadJson(snapshotPath);
  }

  private static async appendAuditEntry(profileId: string, action: string, details?: Record<string, any>) {
    await fs.ensureDir(this.stateDir(profileId));
    const current = await this.readAuditTrail(profileId, 200);
    const entry: ProfileStateAuditEntry = {
      id: crypto.randomUUID(),
      profileId,
      at: new Date().toISOString(),
      action,
      actor: config.worker.id,
      details,
    };
    const next = [entry, ...current].slice(0, 200);
    await fs.writeJson(this.auditLogPath(profileId), next, { spaces: 2 });
  }

  private static async readAuditTrail(profileId: string, limit = 20): Promise<ProfileStateAuditEntry[]> {
    const log = await this.safeReadJson(this.auditLogPath(profileId));
    if (!Array.isArray(log)) return [];
    return log.slice(0, limit);
  }

  private static computeManifestDiff(
    localManifest: ProfileSyncManifest | null,
    cloudManifest: ProfileSyncManifest | null
  ): ProfileStateDiffSummary {
    if (!localManifest && !cloudManifest) {
      return {
        status: 'empty',
        checksumMatch: false,
        versionDelta: 0,
        localOnlyCount: 0,
        cloudOnlyCount: 0,
        changedCount: 0,
        sampleLocalOnly: [],
        sampleCloudOnly: [],
        sampleChanged: [],
      };
    }

    if (localManifest && !cloudManifest) {
      return {
        status: 'local_only',
        checksumMatch: false,
        versionDelta: localManifest.version,
        localOnlyCount: localManifest.fileCount || localManifest.files?.length || 0,
        cloudOnlyCount: 0,
        changedCount: 0,
        sampleLocalOnly: (localManifest.files || []).slice(0, 5).map((file) => file.path),
        sampleCloudOnly: [],
        sampleChanged: [],
      };
    }

    if (!localManifest && cloudManifest) {
      return {
        status: 'cloud_only',
        checksumMatch: false,
        versionDelta: -cloudManifest.version,
        localOnlyCount: 0,
        cloudOnlyCount: cloudManifest.fileCount || cloudManifest.files?.length || 0,
        changedCount: 0,
        sampleLocalOnly: [],
        sampleCloudOnly: (cloudManifest.files || []).slice(0, 5).map((file) => file.path),
        sampleChanged: [],
      };
    }

    const localFiles = new Map((localManifest?.files || []).map((file) => [file.path, file]));
    const cloudFiles = new Map((cloudManifest?.files || []).map((file) => [file.path, file]));
    const localOnly: string[] = [];
    const cloudOnly: string[] = [];
    const changed: string[] = [];

    for (const [filePath, localFile] of localFiles.entries()) {
      const cloudFile = cloudFiles.get(filePath);
      if (!cloudFile) {
        localOnly.push(filePath);
        continue;
      }
      if (cloudFile.checksum !== localFile.checksum) {
        changed.push(filePath);
      }
    }

    for (const filePath of cloudFiles.keys()) {
      if (!localFiles.has(filePath)) {
        cloudOnly.push(filePath);
      }
    }

    const checksumMatch = !!localManifest && !!cloudManifest && localManifest.checksum === cloudManifest.checksum;
    const versionDelta = (localManifest?.version || 0) - (cloudManifest?.version || 0);
    const status: ProfileStateDiffSummary['status'] = checksumMatch
      ? 'in_sync'
      : changed.length || localOnly.length || cloudOnly.length
        ? versionDelta > 0
          ? 'local_ahead'
          : versionDelta < 0
            ? 'cloud_ahead'
            : 'diverged'
        : 'diverged';

    return {
      status,
      checksumMatch,
      versionDelta,
      localOnlyCount: localOnly.length,
      cloudOnlyCount: cloudOnly.length,
      changedCount: changed.length,
      sampleLocalOnly: localOnly.slice(0, 5),
      sampleCloudOnly: cloudOnly.slice(0, 5),
      sampleChanged: changed.slice(0, 5),
    };
  }

  private static async readSyncManifest(profileId: string): Promise<ProfileSyncManifest | null> {
    return await this.safeReadJson(this.syncManifestPath(profileId));
  }

  private static async readCloudManifest(profileId: string): Promise<ProfileSyncManifest | null> {
    return await this.safeReadJson(this.cloudManifestPath(profileId));
  }

  private static async writeSyncManifest(profileId: string, manifest: ProfileSyncManifest) {
    await fs.ensureDir(this.stateDir(profileId));
    await fs.writeJson(this.syncManifestPath(profileId), manifest, { spaces: 2 });
  }

  private static async safeReadJson(targetPath: string) {
    if (!(await fs.pathExists(targetPath))) return null;
    return await fs.readJson(targetPath).catch(() => null);
  }

  private static async countFiles(rootDir: string) {
    if (!(await fs.pathExists(rootDir))) return 0;
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        count += await this.countFiles(fullPath);
      } else {
        count += 1;
      }
    }
    return count;
  }

  private static async computeDirectoryChecksum(rootDir: string) {
    if (!(await fs.pathExists(rootDir))) return 'empty';
    const hash = crypto.createHash('sha256');
    const files = await this.collectFiles(rootDir);
    for (const fullPath of files.sort()) {
      const relativePath = path.relative(rootDir, fullPath);
      const stat = await fs.stat(fullPath);
      hash.update(relativePath);
      hash.update(stat.size.toString());
      if (relativePath.endsWith('.json') || stat.size <= 512 * 1024) {
        hash.update(await fs.readFile(fullPath));
      } else {
        hash.update(stat.mtimeMs.toString());
      }
    }
    return hash.digest('hex');
  }

  private static computeInventoryChecksum(files: Array<{ path: string; size: number; mtimeMs: number; checksum: string }>) {
    const hash = crypto.createHash('sha256');
    for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
      hash.update(file.path);
      hash.update(file.size.toString());
      hash.update(file.checksum);
    }
    return hash.digest('hex');
  }

  private static async collectFiles(rootDir: string): Promise<string[]> {
    const entries = await fs.readdir(rootDir, { withFileTypes: true }).catch(() => []);
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.collectFiles(fullPath));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }

  private static async clearDirectoryContents(targetDir: string, keep: string[] = []) {
    await fs.ensureDir(targetDir);
    const entries = await fs.readdir(targetDir).catch(() => []);
    await Promise.all(
      entries
        .filter((entry) => !keep.includes(entry))
        .map((entry) => fs.remove(path.join(targetDir, entry)))
    );
  }

  private static async copyDirectoryContents(sourceDir: string, targetDir: string, exclude: string[] = []) {
    await fs.ensureDir(targetDir);
    if (!(await fs.pathExists(sourceDir))) return;
    const entries = await fs.readdir(sourceDir).catch(() => []);

    for (const entry of entries) {
      if (exclude.includes(entry)) continue;
      await fs.copy(path.join(sourceDir, entry), path.join(targetDir, entry), { overwrite: true, errorOnExist: false });
    }
  }

  private static async buildFileInventory(rootDir: string, currentDir = rootDir): Promise<Array<{ path: string; size: number; mtimeMs: number; checksum: string }>> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true }).catch(() => []);
    const files: Array<{ path: string; size: number; mtimeMs: number; checksum: string }> = [];

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.buildFileInventory(rootDir, fullPath));
        continue;
      }

      const stat = await fs.stat(fullPath);
      const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
      const checksum = await this.computeFileChecksum(fullPath, stat.size);
      files.push({
        path: relativePath,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        checksum,
      });
    }

    return files;
  }

  private static async computeFileChecksum(fullPath: string, sizeHint?: number) {
    const stat = sizeHint !== undefined ? { size: sizeHint } : await fs.stat(fullPath);
    const hash = crypto.createHash('sha256');
    if (stat.size <= 512 * 1024 || fullPath.endsWith('.json')) {
      hash.update(await fs.readFile(fullPath));
    } else {
      hash.update(fullPath);
      hash.update(stat.size.toString());
    }
    return hash.digest('hex');
  }

  private static async syncDirectoryDelta(
    sourceDir: string,
    targetDir: string,
    previousFiles: Array<{ path: string; checksum: string }> = [],
    nextFiles: Array<{ path: string; checksum: string }> = [],
    exclude: string[] = []
  ) {
    await fs.ensureDir(targetDir);
    const prevMap = new Map(previousFiles.map((file) => [file.path, file.checksum]));
    const nextMap = new Map(nextFiles.map((file) => [file.path, file.checksum]));

    for (const file of nextFiles) {
      if (exclude.includes(path.basename(file.path))) continue;
      if (prevMap.get(file.path) === file.checksum) continue;
      const sourcePath = path.join(sourceDir, file.path);
      const targetPath = path.join(targetDir, file.path);
      await fs.ensureDir(path.dirname(targetPath));
      await fs.copy(sourcePath, targetPath, { overwrite: true, errorOnExist: false });
    }

    for (const file of previousFiles) {
      if (exclude.includes(path.basename(file.path))) continue;
      if (nextMap.has(file.path)) continue;
      await fs.remove(path.join(targetDir, file.path));
    }
  }
}
