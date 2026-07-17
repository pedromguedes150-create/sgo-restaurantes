import { prisma } from '@/lib/db/prisma';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Meu Perfil (16/07): o próprio usuário completa os dados (nome completo, CPF)
 * e troca a própria senha (exige a senha atual). Supervisores/Admins visualizam
 * os dados na lista de usuários.
 */
type Ctx = { ip?: string | null; userAgent?: string | null };
type Result = { ok: true } | { ok: false; reason: 'INVALID' | 'WRONG_PASSWORD'; detail?: string };

export async function updateOwnProfile(user: SessionUser, input: { name?: string; cpf?: string }, ctx: Ctx = {}): Promise<Result> {
  const data: { name?: string; cpf?: string | null } = {};
  if (input.name !== undefined) {
    const n = input.name.trim();
    if (n.length < 3 || n.length > 120) return { ok: false, reason: 'INVALID', detail: 'Nome completo inválido.' };
    data.name = n;
  }
  if (input.cpf !== undefined) {
    const digits = input.cpf.replace(/\D/g, '');
    if (digits && digits.length !== 11) return { ok: false, reason: 'INVALID', detail: 'CPF deve ter 11 dígitos.' };
    data.cpf = digits || null;
  }
  if (Object.keys(data).length === 0) return { ok: false, reason: 'INVALID' };
  await prisma.user.update({ where: { id: user.id }, data });
  await audit({ userId: user.id, action: 'PROFILE_UPDATE', module: 'AUTH', entity: 'user', entityId: user.id, metadata: { fields: Object.keys(data) }, ...ctx });
  return { ok: true };
}

export async function changeOwnPassword(user: SessionUser, currentPassword: string, newPassword: string, ctx: Ctx = {}): Promise<Result> {
  if (!newPassword || newPassword.length < 8) return { ok: false, reason: 'INVALID', detail: 'A nova senha precisa de pelo menos 8 caracteres.' };
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!u) return { ok: false, reason: 'INVALID' };
  const okCurrent = await verifyPassword(currentPassword ?? '', u.passwordHash);
  if (!okCurrent) return { ok: false, reason: 'WRONG_PASSWORD', detail: 'Senha atual incorreta.' };
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
  await audit({ userId: user.id, action: 'PASSWORD_CHANGE', module: 'AUTH', entity: 'user', entityId: user.id, ...ctx });
  return { ok: true };
}
