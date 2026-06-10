import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '@/lib/env';
import type { Role } from '@prisma/client';

/** Conteúdo do access token (mínimo necessário; escopo real é checado no servidor). */
export interface AccessTokenPayload {
  sub: string; // userId
  role: Role;
  name: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

/**
 * Refresh token: valor opaco aleatório. Guardamos apenas o hash no banco
 * (rotação a cada uso). Nunca persistimos o token em claro.
 */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(48).toString('base64url');
  const hash = hashRefreshToken(token);
  return { token, hash };
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Converte um TTL ('30d', '15m', '12h') em milissegundos. */
export function ttlToMs(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!m) throw new Error(`TTL inválido: ${ttl}`);
  const n = Number(m[1]);
  const unit = m[2];
  const mult = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]!;
  return n * mult;
}
