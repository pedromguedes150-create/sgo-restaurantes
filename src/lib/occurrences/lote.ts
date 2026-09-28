import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { markInProgress } from '@/lib/occurrences/close';
import type { SessionUser } from '@/lib/auth/session';

type Ctx = { ip?: string | null; userAgent?: string | null };

/** Quem trata ocorrência: a MESMA lista de sempre (encerrar, andamento, reclassificar). */
export const TRATA_OCORRENCIA: readonly string[] = ['SUPERVISOR', 'ADMIN', 'CEO'];

export type ReclassifyResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID' | 'ALREADY_CLOSED'; detail?: string };

/**
 * Reclassifica UMA ocorrência (tipo/categoria). Era o miolo da rota
 * `/api/occurrences/[id]/update`; saiu para cá porque o lote precisa da MESMA
 * regra — uma segunda cópia na rota do lote envelheceria sozinha.
 */
export async function reclassifyOccurrence(
  user: SessionUser,
  id: string,
  input: { typeId?: string | null; categoryId?: string | null },
  ctx: Ctx = {},
): Promise<ReclassifyResult> {
  if (!TRATA_OCORRENCIA.includes(user.role)) return { ok: false, reason: 'FORBIDDEN', detail: 'Apenas Supervisor/Admin reclassificam' };
  const occ = await prisma.occurrence.findUnique({ where: { id }, select: { unitId: true, status: true, number: true } });
  if (!occ) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, occ.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (occ.status === 'CLOSED') return { ok: false, reason: 'ALREADY_CLOSED', detail: 'Ocorrência já encerrada' };

  const type = input.typeId ? await prisma.occurrenceType.findUnique({ where: { id: String(input.typeId) }, include: { categories: true } }) : null;
  if (!type) return { ok: false, reason: 'INVALID', detail: 'Escolha o tipo' };
  const ativas = type.categories.filter((c) => c.active);
  const category = input.categoryId ? ativas.find((c) => c.id === String(input.categoryId)) : null;
  // O tipo novo TEM categorias? Então escolher uma é obrigatório.
  if (!category && ativas.length > 0) return { ok: false, reason: 'INVALID', detail: 'Escolha a categoria do novo tipo' };

  await prisma.occurrence.update({
    where: { id },
    data: {
      typeId: type.id, typeName: type.name,
      // Escreve SEMPRE, inclusive null — senão a categoria ANTIGA fica colada no tipo novo.
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
    },
  });
  await audit({ userId: user.id, unitId: occ.unitId, action: 'OCCURRENCE_RECLASSIFIED', module: 'OCCURRENCES', entity: 'occurrence', entityId: id, metadata: { number: occ.number, type: type.name, category: category?.name }, ...ctx });
  return { ok: true };
}

export interface ResultadoDoLote {
  /** Ids que mudaram. */
  feitas: string[];
  /** Ids que NÃO mudaram e por quê — "3 marcadas" escondendo 2 puladas esconderia justamente o que precisa de atenção. */
  puladas: { id: string; reason: string }[];
}

const LIMITE_DO_LOTE = 200;

/**
 * Marca VÁRIAS como "Em andamento" (v1.128.0). Não é uma regra nova: chama
 * `markInProgress` uma a uma — cada ocorrência passa pela mesma porta
 * (perfil, escopo por unidade, só OPEN) e ganha a sua linha na Auditoria com
 * usuário, data e hora. Uma já encerrada ou de outra unidade é pulada e contada,
 * não derruba o lote.
 */
export async function markManyInProgress(user: SessionUser, ids: string[], ctx: Ctx = {}): Promise<ResultadoDoLote> {
  return loteDe(ids, (id) => markInProgress(user, id, ctx));
}

/** Reclassifica VÁRIAS para o mesmo tipo/categoria — a mesma regra de `reclassifyOccurrence`, uma a uma. */
export async function reclassifyMany(
  user: SessionUser,
  ids: string[],
  input: { typeId?: string | null; categoryId?: string | null },
  ctx: Ctx = {},
): Promise<ResultadoDoLote> {
  return loteDe(ids, (id) => reclassifyOccurrence(user, id, input, ctx));
}

async function loteDe(ids: string[], acao: (id: string) => Promise<{ ok: true } | { ok: false; reason: string }>): Promise<ResultadoDoLote> {
  const unicos = [...new Set(ids.filter((x) => typeof x === 'string' && x))].slice(0, LIMITE_DO_LOTE);
  const feitas: string[] = [];
  const puladas: { id: string; reason: string }[] = [];
  for (const id of unicos) {
    const r = await acao(id);
    if (r.ok) feitas.push(id); else puladas.push({ id, reason: r.reason });
  }
  return { feitas, puladas };
}

/**
 * Quem marcou "Em andamento" e quando — lido da AUDITORIA (`OCC_IN_PROGRESS`),
 * que já grava isso desde sempre. Sem coluna nova no banco: o pedido foi não
 * mexer no banco sem necessidade, e o dado já existe. A última linha por
 * ocorrência vence (voltar para aberta não existe, mas a regra fica explícita).
 */
export async function responsaveisDoAndamento(ids: string[]): Promise<Map<string, { nome: string; em: Date }>> {
  if (ids.length === 0) return new Map();
  const logs = await prisma.auditLog.findMany({
    where: { action: 'OCC_IN_PROGRESS', entity: 'occurrence', entityId: { in: ids } },
    orderBy: { createdAt: 'desc' },
    select: { entityId: true, createdAt: true, user: { select: { name: true } } },
  });
  const m = new Map<string, { nome: string; em: Date }>();
  for (const l of logs) {
    if (!l.entityId || m.has(l.entityId)) continue;
    m.set(l.entityId, { nome: l.user?.name ?? '—', em: l.createdAt });
  }
  return m;
}
