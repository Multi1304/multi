import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { config } from '../config';
import { logger } from '../utils/logger';

interface ObjectSyncManifestFile {
  path: string;
  size: number;
  checksum: string;
}

interface ObjectSyncManifest {
  version: number;
  updatedAt: string;
  fileCount: number;
  checksum: string;
  files: ObjectSyncManifestFile[];
}

export class ObjectStorageService {
  private static client: S3Client | null = null;
  private static readonly overridePath = path.resolve(process.cwd(), 'runtime-config', 'object-storage.json');

  static isConfigured() {
    const resolved = this.resolveConfigSync();
    return resolved.provider === 's3' && !!resolved.bucket;
  }

  private static getClient() {
    const resolved = this.resolveConfigSync();
    if (!this.client) {
      this.client = new S3Client({
        region: resolved.region,
        endpoint: resolved.endpoint || undefined,
        forcePathStyle: resolved.forcePathStyle,
        credentials: resolved.accessKeyId && resolved.secretAccessKey ? {
          accessKeyId: resolved.accessKeyId,
          secretAccessKey: resolved.secretAccessKey,
        } : undefined,
      });
    }
    return this.client;
  }

  private static bucket() {
    return this.resolveConfigSync().bucket;
  }

  private static normalizeKey(key: string) {
    return key.replace(/\\/g, '/').replace(/^\/+/, '');
  }

  private static prefixed(prefix: string, filePath = '') {
    return this.normalizeKey(path.posix.join(this.resolveConfigSync().keyPrefix, prefix, filePath));
  }

  static async syncDirectory(prefix: string, localDir: string) {
    if (!this.isConfigured()) return null;

    await fs.ensureDir(localDir);
    const files = await this.buildInventory(localDir);
    const manifestKey = this.prefixed(prefix, 'manifest.json');
    const previous = await this.readJson<ObjectSyncManifest>(manifestKey).catch(() => null);
    const previousMap = new Map((previous?.files || []).map((file) => [file.path, file.checksum]));

    for (const file of files) {
      if (previousMap.get(file.path) === file.checksum) continue;
      const body = await fs.readFile(path.join(localDir, file.path));
      await this.getClient().send(new PutObjectCommand({
        Bucket: this.bucket(),
        Key: this.prefixed(prefix, file.path),
        Body: body,
      }));
    }

    for (const file of previous?.files || []) {
      if (files.some((entry) => entry.path === file.path)) continue;
      await this.getClient().send(new DeleteObjectCommand({
        Bucket: this.bucket(),
        Key: this.prefixed(prefix, file.path),
      }));
    }

    const manifest: ObjectSyncManifest = {
      version: (previous?.version || 0) + 1,
      updatedAt: new Date().toISOString(),
      fileCount: files.length,
      checksum: this.computeInventoryChecksum(files),
      files,
    };

    await this.getClient().send(new PutObjectCommand({
      Bucket: this.bucket(),
      Key: manifestKey,
      Body: JSON.stringify(manifest, null, 2),
      ContentType: 'application/json',
    }));

    return manifest;
  }

  static async restoreDirectory(prefix: string, localDir: string) {
    if (!this.isConfigured()) return null;

    await fs.ensureDir(localDir);
    const manifestKey = this.prefixed(prefix, 'manifest.json');
    const manifest = await this.readJson<ObjectSyncManifest>(manifestKey);
    if (!manifest) return null;

    const localFiles = await this.buildInventory(localDir);
    const localMap = new Map(localFiles.map((file) => [file.path, file.checksum]));

    for (const file of manifest.files) {
      if (localMap.get(file.path) === file.checksum) continue;
      const response = await this.getClient().send(new GetObjectCommand({
        Bucket: this.bucket(),
        Key: this.prefixed(prefix, file.path),
      }));
      const body = await this.streamToBuffer(response.Body);
      const targetPath = path.join(localDir, file.path);
      await fs.ensureDir(path.dirname(targetPath));
      await fs.writeFile(targetPath, body);
    }

    for (const localFile of localFiles) {
      if (manifest.files.some((entry) => entry.path === localFile.path)) continue;
      await fs.remove(path.join(localDir, localFile.path));
    }

    return manifest;
  }

  static async exists(prefix: string) {
    if (!this.isConfigured()) return false;
    try {
      await this.getClient().send(new HeadObjectCommand({
        Bucket: this.bucket(),
        Key: this.prefixed(prefix, 'manifest.json'),
      }));
      return true;
    } catch {
      return false;
    }
  }

  static async getStatus() {
    const resolved = await this.resolveConfig();
    return {
      configured: this.isConfigured(),
      provider: resolved.provider,
      bucket: resolved.bucket || null,
      region: resolved.region,
      endpoint: resolved.endpoint || null,
      keyPrefix: resolved.keyPrefix,
      forcePathStyle: resolved.forcePathStyle,
      source: await fs.pathExists(this.overridePath) ? 'runtime-config' : 'environment',
      accessKeyId: resolved.accessKeyId ? `${resolved.accessKeyId.slice(0, 4)}...` : '',
    };
  }

  static async testConnection() {
    if (!this.isConfigured()) {
      return { ok: false, reason: 'Object storage is not configured.' };
    }

    try {
      await this.getClient().send(new ListObjectsV2Command({
        Bucket: this.bucket(),
        Prefix: this.resolveConfigSync().keyPrefix,
        MaxKeys: 1,
      }));
      return { ok: true };
    } catch (error: any) {
      logger.warn('Object storage health check failed', { error: error?.message });
      return { ok: false, reason: error?.message || 'Unknown object storage error' };
    }
  }

  static async readJson<T>(key: string): Promise<T | null> {
    try {
      const response = await this.getClient().send(new GetObjectCommand({
        Bucket: this.bucket(),
        Key: key,
      }));
      const body = await this.streamToBuffer(response.Body);
      return JSON.parse(body.toString('utf8')) as T;
    } catch (error: any) {
      logger.warn('Object storage read failed', { key, error: error?.message });
      return null;
    }
  }

  static async listPrefix(prefix: string) {
    if (!this.isConfigured()) return [];
    const response = await this.getClient().send(new ListObjectsV2Command({
      Bucket: this.bucket(),
      Prefix: this.prefixed(prefix),
    }));
    return (response.Contents || []).map((item) => item.Key || '').filter(Boolean);
  }

  static async putBuffer(key: string, body: Buffer, contentType = 'application/octet-stream') {
    if (!this.isConfigured()) return { ok: false, provider: 'filesystem' };
    await this.getClient().send(new PutObjectCommand({
      Bucket: this.bucket(),
      Key: this.normalizeKey(key),
      Body: body,
      ContentType: contentType,
    }));
    return { ok: true, provider: 's3', key: this.normalizeKey(key) };
  }

  static async getBuffer(key: string) {
    if (!this.isConfigured()) return null;
    try {
      const response = await this.getClient().send(new GetObjectCommand({
        Bucket: this.bucket(),
        Key: this.normalizeKey(key),
      }));
      return await this.streamToBuffer(response.Body);
    } catch (error: any) {
      logger.warn('Object storage buffer read failed', { key, error: error?.message });
      return null;
    }
  }

  static async updateConfig(partial: Partial<typeof config.objectStorage>) {
    const nextConfig = {
      ...(await this.resolveConfig()),
      ...partial,
    };

    await fs.ensureDir(path.dirname(this.overridePath));
    await fs.writeJson(this.overridePath, nextConfig, { spaces: 2 });
    this.client = null;
    return await this.getStatus();
  }

  private static async resolveConfig() {
    const override = await this.readOverride();
    return {
      ...config.objectStorage,
      ...(override || {}),
    };
  }

  private static resolveConfigSync() {
    let override = null;
    try {
      if (fs.existsSync(this.overridePath)) {
        override = fs.readJsonSync(this.overridePath);
      }
    } catch (error: any) {
      logger.warn('Object storage config override read failed', { error: error?.message });
    }

    return {
      ...config.objectStorage,
      ...(override || {}),
    };
  }

  private static async readOverride() {
    try {
      if (!(await fs.pathExists(this.overridePath))) return null;
      return await fs.readJson(this.overridePath);
    } catch (error: any) {
      logger.warn('Object storage config override unavailable', { error: error?.message });
      return null;
    }
  }

  private static async buildInventory(rootDir: string, currentDir = rootDir): Promise<ObjectSyncManifestFile[]> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true }).catch(() => []);
    const files: ObjectSyncManifestFile[] = [];

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.buildInventory(rootDir, fullPath));
        continue;
      }

      const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
      const size = (await fs.stat(fullPath)).size;
      const checksum = await this.computeFileChecksum(fullPath, size);
      files.push({ path: relativePath, size, checksum });
    }

    return files;
  }

  private static async computeFileChecksum(fullPath: string, size: number) {
    const hash = crypto.createHash('sha256');
    if (size <= 512 * 1024 || fullPath.endsWith('.json')) {
      hash.update(await fs.readFile(fullPath));
    } else {
      hash.update(fullPath);
      hash.update(size.toString());
    }
    return hash.digest('hex');
  }

  private static computeInventoryChecksum(files: ObjectSyncManifestFile[]) {
    const hash = crypto.createHash('sha256');
    for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
      hash.update(file.path);
      hash.update(file.size.toString());
      hash.update(file.checksum);
    }
    return hash.digest('hex');
  }

  private static async streamToBuffer(body: any) {
    if (!body) return Buffer.from([]);
    if (Buffer.isBuffer(body)) return body;
    if (typeof body.transformToByteArray === 'function') {
      const bytes = await body.transformToByteArray();
      return Buffer.from(bytes);
    }
    if (body instanceof Readable) {
      const chunks: Buffer[] = [];
      for await (const chunk of body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    }
    return Buffer.from(body);
  }
}
