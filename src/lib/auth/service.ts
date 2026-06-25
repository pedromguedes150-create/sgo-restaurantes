import { prisma } from '@/lib/db/prisma';
import { verifyPassword } from '@/lib/auth/password';
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  ttlToMs,
} from '@/lib/auth/jwt';
import { env } from '@/lib/env';
import { audit } from '@/lib/audit';
import type { User } from '@prisma/client';

export interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  accessMaxAgeMs: number;
  refreshMaxAgeMs: number;
  user: { id: string; name: string; role: User['role'] };
}

/** Emite access + refresh para um usuário e persiste o hash do refresh. */
export async function issueSession(user: User, ctx: RequestContext): Promise<IssuedSession> {
  const accessToken = signAccessToken({ sub: user.id, role: user.role, name: user.name });
  const { token: refreshToken, hash } = generateRefreshToken();
  const refreshMaxAgeMs = ttlToMs(env.JWT_REFRESH_TTL);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + refreshMaxAgeMs),
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    },
  });

  return {
    accessToken,
    refreshToken,
    accessMaxAgeMs: ttlToMs(env.JWT_ACCESS_TTL),
    refreshMaxAgeMs,
    user: { id: user.id, name: user.name, role: user.role },
  };
}

/**
 * Autentica por email+senha. Retorna a sessão emitida ou null se credenciais inválidas.
 * Mensagem genérica de erro fica a cargo do chamador (não revelar se o email existe).
 */
export async function authenticate(
  email: string,
  password: string,
  ctx: RequestContext,
): Promise<IssuedSession | null> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user || !user.active) return null;

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await audit({ userId: user.id, action: 'LOGIN_FAILED', module: 'AUTH', ...ctx });
    return null;
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ userId: user.id, action: 'LOGIN', module: 'AUTH', ...ctx });

  return issueSession(user, ctx);
}

/**
 * Rotaciona o refresh token: valida, revoga o antigo e emite um novo par.
 * Retorna null se o token for inválido/expirado/revogado.
 */
export async function rotateRefresh(
  oldToken: string,
  ctx: RequestContext,
): Promise<IssuedSession | null> {
  const hash = hashRefreshToken(oldToken);
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: hash },
    include: { user: true },
  });

  if (!existing || existing.expiresAt < new Date() || !existing.user.active) {
    return null;
  }
  // Tolerância a corridas (prefetch/abas): um token revogado há poucos segundos
  // ainda pode rotacionar uma vez — evita logout indevido. Revogado há mais
  // tempo = inválido de fato.
  const GRACE_MS = 30_000;
  if (existing.revokedAt && Date.now() - existing.revokedAt.getTime() > GRACE_MS) {
    return null;
  }
  if (!existing.revokedAt) {
    await prisma.refreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
  }

  return issueSession(existing.user, ctx);
}

/** Revoga um refresh token (logout). */
export async function revokeRefresh(token: string, userId?: string, ctx?: RequestContext): Promise<void> {
  const hash = hashRefreshToken(token);
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (userId) {
    await audit({ userId, action: 'LOGOUT', module: 'AUTH', ...ctx });
  }
}

/** Extrai IP e User-Agent de uma Request (para auditoria). */
export function requestContext(req: Request): RequestContext {
  const h = req.headers;
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    null;
  return { ip, userAgent: h.get('user-agent') };
}
