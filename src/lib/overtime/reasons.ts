import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';

type Ctx = { ip?: string | null; userAgent?: string | null };
type Resultado = { ok: true } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'CONFLICT'; message?: string };

/**
 * MOTIVOS DE HORA EXTRA (v1.142.0) — catálogo configurável.
 *
 * O "Comparativo por motivo" do painel precisa de CHAVE, não de texto livre:
 * "escala incompleta", "Escala Incompleta" e "escala incompl." são três motivos
 * para o banco e um só para quem lê. O gerente escolhe da lista; o texto livre
 * continua existindo como DETALHE (`PaymentRequest.reason`), e a hora extra
 * antiga — que só tem o texto — cai em "Outro" na leitura, sem perder o texto.
 *
 * Mesma porta dos valores/hora: só o ADMIN mexe. Motivo usado em solicitação
 * não se exclui, desativa (a FK é SetNull — apagar faria a HE "esquecer" o
 * motivo em silêncio).
 */

/** Semeados UMA vez, quando a tabela está vazia (o Admin edita depois). */
export const MOTIVOS_PADRAO = ['Escala incompleta', 'Hora de janta', 'Cobertura de falta', 'Evento / movimento atípico', 'Outro'] as const;

export interface OvertimeReasonRow { id: string; name: string; active: boolean; order: number; usos?: number }

export async function ensureDefaultOvertimeReasons(): Promise<void> {
  const n = await prisma.overtimeReason.count();
  if (n > 0) return;
  await prisma.overtimeReason.createMany({ data: MOTIVOS_PADRAO.map((name, order) => ({ name, order })) });
}

export async function listOvertimeReasons(): Promise<OvertimeReasonRow[]> {
  await ensureDefaultOvertimeReasons();
  const rows = await prisma.overtimeReason.findMany({ orderBy: [{ order: 'asc' }, { name: 'asc' }], include: { _count: { select: { requests: true } } } });
  return rows.map((r) => ({ id: r.id, name: r.name, active: r.active, order: r.order, usos: r._count.requests }));
}

/** Só os ATIVOS — é o que o seletor da solicitação oferece. */
export async function activeOvertimeReasons(): Promise<{ id: string; name: string }[]> {
  await ensureDefaultOvertimeReasons();
  return prisma.overtimeReason.findMany({ where: { active: true }, orderBy: [{ order: 'asc' }, { name: 'asc' }], select: { id: true, name: true } });
}

/** O motivo existe e está ativo? Barra id inventado por fora da tela. */
export async function overtimeReasonAllowed(id: string | null | undefined): Promise<boolean> {
  if (!id) return false;
  const r = await prisma.overtimeReason.findUnique({ where: { id }, select: { active: true } });
  return Boolean(r?.active);
}

const nomeValido = (name: unknown) => typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 60;

export async function addOvertimeReason(user: SessionUser, name: string, ctx: Ctx = {}): Promise<Resultado> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  if (!nomeValido(name)) return { ok: false, reason: 'INVALID', message: 'Informe um motivo com 2 a 60 caracteres.' };
  const nome = name.trim();
  const existe = await prisma.overtimeReason.findFirst({ where: { name: { equals: nome, mode: 'insensitive' } } });
  if (existe) {
    if (existe.active) return { ok: false, reason: 'CONFLICT', message: 'Este motivo já está cadastrado.' };
    await prisma.overtimeReason.update({ where: { id: existe.id }, data: { active: true } });
  } else {
    const max = await prisma.overtimeReason.aggregate({ _max: { order: true } });
    await prisma.overtimeReason.create({ data: { name: nome, order: (max._max.order ?? -1) + 1 } });
  }
  await audit({ userId: user.id, action: 'OVERTIME_REASON_ADD', module: 'CONFIG', metadata: { name: nome }, ...ctx });
  return { ok: true };
}

export async function renameOvertimeReason(user: SessionUser, id: string, name: string, ctx: Ctx = {}): Promise<Resultado> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  if (!nomeValido(name)) return { ok: false, reason: 'INVALID', message: 'Informe um motivo com 2 a 60 caracteres.' };
  const r = await prisma.overtimeReason.findUnique({ where: { id } });
  if (!r) return { ok: false, reason: 'INVALID' };
  await prisma.overtimeReason.update({ where: { id }, data: { name: name.trim() } });
  await audit({ userId: user.id, action: 'OVERTIME_REASON_RENAME', module: 'CONFIG', metadata: { de: r.name, para: name.trim() }, ...ctx });
  return { ok: true };
}

export async function toggleOvertimeReason(user: SessionUser, id: string, active: boolean, ctx: Ctx = {}): Promise<Resultado> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const r = await prisma.overtimeReason.findUnique({ where: { id } });
  if (!r) return { ok: false, reason: 'INVALID' };
  await prisma.overtimeReason.update({ where: { id }, data: { active: Boolean(active) } });
  await audit({ userId: user.id, action: 'OVERTIME_REASON_TOGGLE', module: 'CONFIG', metadata: { name: r.name, active: Boolean(active) }, ...ctx });
  return { ok: true };
}

/** Só sem uso. Com solicitação apontando para ele, o caminho é desativar. */
export async function deleteOvertimeReason(user: SessionUser, id: string, ctx: Ctx = {}): Promise<Resultado> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const r = await prisma.overtimeReason.findUnique({ where: { id }, include: { _count: { select: { requests: true } } } });
  if (!r) return { ok: false, reason: 'INVALID' };
  if (r._count.requests > 0) return { ok: false, reason: 'CONFLICT', message: `"${r.name}" está em ${r._count.requests} solicitação(ões). Desative em vez de excluir.` };
  await prisma.overtimeReason.delete({ where: { id } });
  await audit({ userId: user.id, action: 'OVERTIME_REASON_DELETE', module: 'CONFIG', metadata: { name: r.name }, ...ctx });
  return { ok: true };
}
