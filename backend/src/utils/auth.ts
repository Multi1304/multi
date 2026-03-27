import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { config } from '../config';

export interface TokenPayload {
  userId: string;
  tenantId: string;
  role?: string;
}

export function signToken(payload: TokenPayload) {
  return jwt.sign(payload as any, config.jwt.secret, {
    expiresIn: config.jwt.accessExpiresIn as any,
    jwtid: crypto.randomUUID(),
  });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, config.jwt.secret) as TokenPayload;
}

export async function hashPassword(password: string) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}
