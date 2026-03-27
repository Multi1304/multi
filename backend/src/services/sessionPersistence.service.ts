import fs from 'fs-extra';
import path from 'path';
import zlib from 'zlib';
import type { BrowserContext } from 'playwright';
import { encryptBuffer, decryptBuffer } from '../utils/cryptoVault';
import { ObjectStorageService } from './objectStorage.service';
import { RuntimeEnvironmentMode, RuntimeEnvironmentService } from './runtimeEnvironment.service';
import { logger } from '../utils/logger';
import { ProfileEncryptionService } from './profileEncryption.service';

export interface SessionPersistenceCaptureOptions {
  profileId?: string | null;
  tenantId?: string | null;
  fingerprint?: any;
  environment?: RuntimeEnvironmentMode;
}

export interface SessionPersistenceSummary {
  cookies: {
    count: number;
    sampleDomains: string[];
  };
  localStorage: {
    origins: number;
    itemCount: number;
    sampleOrigins: string[];
  };
  persistentStores: {
    root: string;
    indexedDbFiles: number;
    serviceWorkerFiles: number;
    cacheStorageFiles: number;
    localStorageFiles: number;
    status: 'light' | 'materialized';
  };
  environment: RuntimeEnvironmentMode;
  artifact?: {
    mode: 'local-encrypted' | 's3-encrypted';
    path?: string;
    key?: string;
    fileCount: number;
    bytes: number;
    capturedAt: string;
  } | null;
  encryption?: {
    version: string;
    mode: 'sandbox' | 'production';
  } | null;
}

interface SessionPersistenceAdapter {
  capture(userDataDir: string, context?: BrowserContext | null, options?: SessionPersistenceCaptureOptions): Promise<SessionPersistenceSummary>;
  restore?(userDataDir: string, options?: SessionPersistenceCaptureOptions): Promise<boolean>;
}

class SandboxSessionPersistenceAdapter implements SessionPersistenceAdapter {
  async capture(userDataDir: string, context?: BrowserContext | null): Promise<SessionPersistenceSummary> {
    const storageState = context ? await context.storageState().catch(() => null) : null;
    const origins = storageState?.origins || [];
    const cookies = storageState?.cookies || [];
    const profileStorage = await inspectProfileDirectory(userDataDir);

    return {
      cookies: {
        count: cookies.length,
        sampleDomains: Array.from<string>(new Set<string>(cookies.map((cookie: any) => String(cookie.domain || '')).filter(Boolean))).slice(0, 6),
      },
      localStorage: {
        origins: origins.length,
        itemCount: origins.reduce((sum: number, origin: any) => sum + ((origin.localStorage || []).length || 0), 0),
        sampleOrigins: origins.slice(0, 6).map((origin: any) => String(origin.origin)),
      },
      persistentStores: profileStorage,
      environment: 'sandbox',
      artifact: null,
      encryption: {
        version: 'sandbox',
        mode: 'sandbox',
      },
    };
  }
}

class ProductionSessionPersistenceAdapter implements SessionPersistenceAdapter {
  async capture(userDataDir: string, context?: BrowserContext | null, options?: SessionPersistenceCaptureOptions): Promise<SessionPersistenceSummary> {
    const storageState = context ? await context.storageState().catch(() => null) : null;
    const origins = storageState?.origins || [];
    const cookies = storageState?.cookies || [];
    const profileStorage = await inspectProfileDirectory(userDataDir);
    const artifact = await this.persistArtifact(userDataDir, storageState, options);

    return {
      cookies: {
        count: cookies.length,
        sampleDomains: Array.from<string>(new Set<string>(cookies.map((cookie: any) => String(cookie.domain || '')).filter(Boolean))).slice(0, 6),
      },
      localStorage: {
        origins: origins.length,
        itemCount: origins.reduce((sum: number, origin: any) => sum + ((origin.localStorage || []).length || 0), 0),
        sampleOrigins: origins.slice(0, 6).map((origin: any) => String(origin.origin)),
      },
      persistentStores: profileStorage,
      environment: 'production',
      artifact,
      encryption: {
        version: 'zkp-v2',
        mode: 'production',
      },
    };
  }

  async restore(userDataDir: string, options?: SessionPersistenceCaptureOptions) {
    const profileId = options?.profileId;
    if (!profileId) return false;

    const artifactDir = path.resolve(process.cwd(), 'runtime-sessions', profileId);
    const localArtifactPath = path.join(artifactDir, 'latest.encbin');
    let encryptedPayload: Buffer | null = null;

    if (await fs.pathExists(localArtifactPath)) {
      encryptedPayload = await fs.readFile(localArtifactPath);
    } else if (ObjectStorageService.isConfigured()) {
      encryptedPayload = await ObjectStorageService.getBuffer(this.objectKey(profileId));
    }

    if (!encryptedPayload) return false;

    const decryptedPayload = options?.profileId && options?.tenantId
      ? await ProfileEncryptionService.decryptProfileBuffer(
          options.profileId,
          options.tenantId,
          encryptedPayload,
          'session-restore'
        ).catch(() => decryptBuffer(encryptedPayload))
      : decryptBuffer(encryptedPayload);

    const bundle = JSON.parse(zlib.gunzipSync(decryptedPayload).toString('utf8')) as {
      files: Array<{ relativePath: string; contentBase64: string }>;
    };

    for (const file of bundle.files || []) {
      const target = path.join(userDataDir, file.relativePath);
      await fs.ensureDir(path.dirname(target));
      await fs.writeFile(target, Buffer.from(file.contentBase64, 'base64'));
    }

    return true;
  }

  private async persistArtifact(userDataDir: string, storageState: any, options?: SessionPersistenceCaptureOptions) {
    const profileId = options?.profileId || path.basename(userDataDir);
    const capturedAt = new Date().toISOString();
    const bundle = await buildProductionBundle(userDataDir, storageState, {
      profileId,
      tenantId: options?.tenantId || null,
      fingerprintSummary: {
        userAgent: options?.fingerprint?.userAgent || null,
        timezoneId: options?.fingerprint?.timezoneId || options?.fingerprint?.timezone || null,
        language: options?.fingerprint?.language || null,
      },
      capturedAt,
    });

    const compressed = zlib.gzipSync(Buffer.from(JSON.stringify(bundle), 'utf8'));
    const encrypted = options?.profileId && options?.tenantId
      ? await ProfileEncryptionService.encryptProfileBuffer(options.profileId, options.tenantId, compressed)
      : encryptBuffer(compressed);

    const artifactDir = path.resolve(process.cwd(), 'runtime-sessions', profileId);
    await fs.ensureDir(artifactDir);
    const localArtifactPath = path.join(artifactDir, 'latest.encbin');
    const manifestPath = path.join(artifactDir, 'latest.json');
    await fs.writeFile(localArtifactPath, encrypted);
    await fs.writeJson(manifestPath, {
      profileId,
      environment: 'production',
      fileCount: bundle.files.length,
      bytes: encrypted.byteLength,
      capturedAt,
      localArtifactPath,
    }, { spaces: 2 });

    const key = this.objectKey(profileId);
    let mode: 'local-encrypted' | 's3-encrypted' = 'local-encrypted';
    if (ObjectStorageService.isConfigured()) {
      await ObjectStorageService.putBuffer(key, encrypted, 'application/octet-stream');
      mode = 's3-encrypted';
    }

    return {
      mode,
      path: localArtifactPath,
      key: ObjectStorageService.isConfigured() ? key : undefined,
      fileCount: bundle.files.length,
      bytes: encrypted.byteLength,
      capturedAt,
    };
  }

  private objectKey(profileId: string) {
    return `session-state/${profileId}/latest.encbin`;
  }
}

const sandboxAdapter = new SandboxSessionPersistenceAdapter();
const productionAdapter = new ProductionSessionPersistenceAdapter();

export class SessionPersistenceService {
  static async capture(userDataDir: string, context?: BrowserContext | null, options?: SessionPersistenceCaptureOptions) {
    const environment = await RuntimeEnvironmentService.resolve({
      tenantId: options?.tenantId,
      fingerprint: options?.fingerprint,
      explicitMode: options?.environment,
    });
    const adapter = environment === 'sandbox' ? sandboxAdapter : productionAdapter;
    return adapter.capture(userDataDir, context, options);
  }

  static async restore(userDataDir: string, options?: SessionPersistenceCaptureOptions) {
    const environment = await RuntimeEnvironmentService.resolve({
      tenantId: options?.tenantId,
      fingerprint: options?.fingerprint,
      explicitMode: options?.environment,
    });
    const adapter = environment === 'sandbox' ? sandboxAdapter : productionAdapter;
    const restorable = adapter as SessionPersistenceAdapter;
    if (!restorable.restore) return false;
    try {
      return await restorable.restore(userDataDir, options);
    } catch (error: any) {
      logger.warn('Session persistence restore failed', {
        profileId: options?.profileId,
        environment,
        error: error?.message,
      });
      return false;
    }
  }
}

async function inspectProfileDirectory(userDataDir: string) {
  const chromiumDefault = path.join(userDataDir, 'Default');
  const candidates = {
    indexedDbFiles: path.join(chromiumDefault, 'IndexedDB'),
    serviceWorkerFiles: path.join(chromiumDefault, 'Service Worker'),
    cacheStorageFiles: path.join(chromiumDefault, 'Cache', 'Cache_Data'),
    localStorageFiles: path.join(chromiumDefault, 'Local Storage'),
  };

  const [indexedDbFiles, serviceWorkerFiles, cacheStorageFiles, localStorageFiles] = await Promise.all([
    countFilesSafe(candidates.indexedDbFiles),
    countFilesSafe(candidates.serviceWorkerFiles),
    countFilesSafe(candidates.cacheStorageFiles),
    countFilesSafe(candidates.localStorageFiles),
  ]);

  return {
    root: userDataDir,
    indexedDbFiles,
    serviceWorkerFiles,
    cacheStorageFiles,
    localStorageFiles,
    status: ((indexedDbFiles + serviceWorkerFiles + cacheStorageFiles + localStorageFiles) > 0 ? 'materialized' : 'light') as 'materialized' | 'light',
  };
}

async function buildProductionBundle(userDataDir: string, storageState: any, metadata: any) {
  const targets = [
    path.join('Default', 'Network', 'Cookies'),
    path.join('Default', 'Local Storage'),
    path.join('Default', 'IndexedDB'),
    path.join('Default', 'Service Worker'),
    path.join('Default', 'Cache', 'Cache_Data'),
  ];

  const files: Array<{ relativePath: string; contentBase64: string }> = [];
  for (const relativeTarget of targets) {
    const absoluteTarget = path.join(userDataDir, relativeTarget);
    if (!(await fs.pathExists(absoluteTarget))) continue;
    const stat = await fs.stat(absoluteTarget);
    if (stat.isDirectory()) {
      files.push(...await readDirectoryContents(userDataDir, absoluteTarget));
    } else {
      files.push({
        relativePath: relativeTarget.replace(/\\/g, '/'),
        contentBase64: (await fs.readFile(absoluteTarget)).toString('base64'),
      });
    }
  }

  return {
    version: 1,
    createdAt: metadata.capturedAt,
    metadata,
    storageState,
    files,
  };
}

async function readDirectoryContents(rootDir: string, currentDir: string): Promise<Array<{ relativePath: string; contentBase64: string }>> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const files: Array<{ relativePath: string; contentBase64: string }> = [];
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await readDirectoryContents(rootDir, fullPath));
      continue;
    }
    files.push({
      relativePath: path.relative(rootDir, fullPath).replace(/\\/g, '/'),
      contentBase64: (await fs.readFile(fullPath)).toString('base64'),
    });
  }
  return files;
}

async function countFilesSafe(dir: string): Promise<number> {
  const exists = await fs.pathExists(dir);
  if (!exists) return 0;
  const entries = await fs.readdir(dir);
  let total = 0;
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = await fs.stat(full);
    if (stat.isDirectory()) total += await countFilesSafe(full);
    else total += 1;
  }
  return total;
}
