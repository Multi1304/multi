import crypto from 'crypto';
import { config } from '../config';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function deriveKey(): Buffer {
  // Derive a 32-byte key from the config encryption key
  return crypto.scryptSync(config.encryption.key, 'multilogin-salt', KEY_LENGTH);
}

/**
 * Encrypt a string. Returns base64-encoded "iv:encrypted:tag".
 */
export function encrypt(plaintext: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const tag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${encrypted}:${tag.toString('base64')}`;
}

/**
 * Decrypt a string previously encrypted with encrypt().
 */
export function decrypt(ciphertext: string): string {
  const key = deriveKey();
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Invalid ciphertext format');

  const iv = Buffer.from(parts[0], 'base64');
  const encrypted = parts[1];
  const tag = Buffer.from(parts[2], 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
