import crypto from 'crypto';
import { decryptSecret, encryptSecret, isEncryptedSecret } from '../utils/cryptoVault';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function randomBase32(length = 32) {
  let output = '';
  const random = crypto.randomBytes(length);
  for (let index = 0; index < random.length; index += 1) {
    output += BASE32_ALPHABET[random[index] % BASE32_ALPHABET.length];
  }
  return output;
}

function base32Decode(input: string) {
  const normalized = input.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = '';
  for (const char of normalized) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value < 0) {
      throw new Error('Invalid base32 character');
    }
    bits += value.toString(2).padStart(5, '0');
  }

  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateCode(secret: string, timestamp = Date.now(), stepSeconds = 30, digits = 6) {
  const counter = Math.floor(timestamp / 1000 / stepSeconds);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const key = base32Decode(secret);
  const digest = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(code % 10 ** digits).padStart(digits, '0');
}

export class TotpService {
  static createSetup(email: string, issuer = 'Camel') {
    const secret = randomBase32(32);
    const label = encodeURIComponent(`${issuer}:${email}`);
    const encodedIssuer = encodeURIComponent(issuer);
    const otpauthUri = `otpauth://totp/${label}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;

    return {
      secret,
      encryptedSecret: encryptSecret(secret),
      otpauthUri,
      issuer,
      account: email,
    };
  }

  static unwrapSecret(secret: string) {
    return isEncryptedSecret(secret) ? decryptSecret(secret) : secret;
  }

  static verify(secret: string, code: string, timestamp = Date.now()) {
    const normalizedCode = String(code || '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(normalizedCode)) {
      return false;
    }

    const rawSecret = this.unwrapSecret(secret);
    const windows = [-1, 0, 1];
    return windows.some((windowOffset) => {
      const expected = generateCode(rawSecret, timestamp + windowOffset * 30_000);
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(normalizedCode));
    });
  }

  static generateForTimestamp(secret: string, timestamp = Date.now()) {
    const rawSecret = this.unwrapSecret(secret);
    return generateCode(rawSecret, timestamp);
  }
}
