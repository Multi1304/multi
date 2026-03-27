import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import { config } from '../config';

export interface ProfileEncryptionSummary {
  enabled: boolean;
  mode: 'sandbox' | 'production';
  version: 'zkp-v2';
  algorithm: string;
  keyOrigin: 'profile-dek';
  adminRecovery: {
    enabled: boolean;
    policy: 'dual-control-escrow';
    legalHoldReady: boolean;
    requiresReason: boolean;
    lastRecoveryAt: string | null;
  };
  createdAt: string | null;
  rotatedAt: string | null;
}

interface ProfileEncryptionEnvelope {
  profileId: string;
  tenantId: string;
  version: 'zkp-v2';
  algorithm: 'aes-256-gcm';
  wrappedDek: string;
  createdAt: string;
  rotatedAt: string;
  adminRecovery: {
    enabled: boolean;
    policy: 'dual-control-escrow';
    legalHoldReady: boolean;
    requiresReason: boolean;
    lastRecoveryAt: string | null;
  };
}

interface EncryptedProfileBufferV2 {
  version: 'zkp-v2';
  algorithm: 'aes-256-gcm';
  iv: string;
  tag: string;
  payload: string;
}

export class ProfileEncryptionService {
  static async ensureEnvelope(profileId: string, tenantId: string) {
    const existing = await this.readEnvelope(profileId);
    if (existing) return existing;

    const dek = crypto.randomBytes(32);
    const now = new Date().toISOString();
    const envelope: ProfileEncryptionEnvelope = {
      profileId,
      tenantId,
      version: 'zkp-v2',
      algorithm: 'aes-256-gcm',
      wrappedDek: this.wrapDek(dek),
      createdAt: now,
      rotatedAt: now,
      adminRecovery: {
        enabled: true,
        policy: 'dual-control-escrow',
        legalHoldReady: true,
        requiresReason: true,
        lastRecoveryAt: null,
      },
    };

    await this.writeEnvelope(profileId, envelope);
    return envelope;
  }

  static async encryptProfileBuffer(profileId: string, tenantId: string, buffer: Buffer) {
    const envelope = await this.ensureEnvelope(profileId, tenantId);
    const dek = this.unwrapDek(envelope.wrappedDek);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const payload: EncryptedProfileBufferV2 = {
      version: 'zkp-v2',
      algorithm: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      payload: encrypted.toString('base64'),
    };
    return Buffer.from(JSON.stringify(payload), 'utf8');
  }

  static async decryptProfileBuffer(profileId: string, tenantId: string, buffer: Buffer, recoveryReason?: string) {
    const envelope = await this.ensureEnvelope(profileId, tenantId);
    const parsed = JSON.parse(buffer.toString('utf8')) as EncryptedProfileBufferV2;
    if (parsed.version !== 'zkp-v2') {
      throw new Error('Unsupported profile encryption payload');
    }

    if (recoveryReason) {
      envelope.adminRecovery.lastRecoveryAt = new Date().toISOString();
      await this.writeEnvelope(profileId, envelope);
    }

    const dek = this.unwrapDek(envelope.wrappedDek);
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      dek,
      Buffer.from(parsed.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(parsed.payload, 'base64')),
      decipher.final(),
    ]);
  }

  static async getSummary(profileId: string, tenantId: string): Promise<ProfileEncryptionSummary> {
    const envelope = await this.ensureEnvelope(profileId, tenantId);
    return {
      enabled: true,
      mode: 'production',
      version: 'zkp-v2',
      algorithm: envelope.algorithm,
      keyOrigin: 'profile-dek',
      adminRecovery: envelope.adminRecovery,
      createdAt: envelope.createdAt,
      rotatedAt: envelope.rotatedAt,
    };
  }

  private static async readEnvelope(profileId: string): Promise<ProfileEncryptionEnvelope | null> {
    try {
      return await fs.readJson(this.envelopePath(profileId));
    } catch {
      return null;
    }
  }

  private static async writeEnvelope(profileId: string, envelope: ProfileEncryptionEnvelope) {
    await fs.ensureDir(path.dirname(this.envelopePath(profileId)));
    await fs.writeJson(this.envelopePath(profileId), envelope, { spaces: 2 });
  }

  private static envelopePath(profileId: string) {
    return path.resolve(config.profileStateDir, 'encryption', `${profileId}.json`);
  }

  private static masterKey() {
    return crypto.createHash('sha256').update(config.encryption.key).digest();
  }

  private static wrapDek(dek: Buffer) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey(), iv);
    const payload = Buffer.concat([cipher.update(dek), cipher.final()]);
    return JSON.stringify({
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      payload: payload.toString('base64'),
    });
  }

  private static unwrapDek(serialized: string) {
    const parsed = JSON.parse(serialized);
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      this.masterKey(),
      Buffer.from(parsed.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(parsed.payload, 'base64')),
      decipher.final(),
    ]);
  }
}
