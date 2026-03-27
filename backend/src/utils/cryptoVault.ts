import crypto from 'crypto';
import { config } from '../config';

const VAULT_VERSION = 'encv1';
const BUFFER_VAULT_VERSION = 'encb1';

function deriveKey() {
  return crypto.createHash('sha256').update(config.encryption.key).digest();
}

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VAULT_VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

export function isEncryptedSecret(value: string | null | undefined) {
  return typeof value === 'string' && value.startsWith(`${VAULT_VERSION}:`);
}

export function decryptSecret(value: string) {
  if (!isEncryptedSecret(value)) {
    throw new Error('Secret is not encrypted with the supported vault format');
  }

  const [, ivBase64, tagBase64, payloadBase64] = value.split(':');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    deriveKey(),
    Buffer.from(ivBase64, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tagBase64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payloadBase64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function encryptBuffer(buffer: Buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.from(
    JSON.stringify({
      version: BUFFER_VAULT_VERSION,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      payload: encrypted.toString('base64'),
    }),
    'utf8'
  );
}

export function decryptBuffer(buffer: Buffer) {
  const parsed = JSON.parse(buffer.toString('utf8'));
  if (!parsed || parsed.version !== BUFFER_VAULT_VERSION) {
    throw new Error('Buffer is not encrypted with the supported vault format');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    deriveKey(),
    Buffer.from(parsed.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(parsed.payload, 'base64')),
    decipher.final(),
  ]);
}
