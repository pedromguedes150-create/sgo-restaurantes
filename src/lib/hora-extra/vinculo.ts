import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { escopo } from '@/lib/payments/consolidado';
import { colaboradorDaUnidade } from '@/lib/payments/create';
import type { SessionUser } from '@/lib/auth/session';
import { candidatosDeVinculo, type CandidatoRh } from '@/lib/hora-extra/calculo';

type Ctx = { ip?: string | null; userAgent?: string | null };

/**
 * VÍNCULO DA HORA EXTRA ANTIGA COM O RH (v1.142.0).
 *
 * Até a v1.126.0 a HE guardava só o NOME digitado — "Vera Lucia", "Vera Lúcia"
 * e "Vera dos Anjos" viravam três pessoas no arquivo, e nenhuma tinha CPF nem
 * matrícula (que vivem no cadastro do RH, não na solicitação).
 *
 * Decisão do Pedro: AUTOMÁTICO só quando o nome, normalizado, bate com UM
 * colaborador ativo da unidade — zero ambiguidade; o resto fica numa fila
 * manual, com sugestões, para o Admin/Supervisão escolher. O nome congelado na
 * solicitação NÃO é reescrito (histórico); o que muda é `collaboratorId`, e a
 * leitura passa a mostrar o nome do cadastro.
 */

export const PODE_VINCULAR = new Set(['ADMIN', 'CEO', 'SUPERVISOR', 'COORDINATOR']);

type HeSemVinculo = { id: string; unitId: string; collaboratorName: string | null };

async function colaboradoresPorUnidade(unitIds: string[]): Promise<Map<string, CandidatoRh[]>> {
  const por = new Map<string, CandidatoRh[]>();
  if (unitIds.length === 0) return por;
  const vinculos = await prisma.collaboratorUnit.findMany({
    where: { unitId: { in: unitIds }, collaborator: { active: true } },
    select: { unitId: true, collaborator: { select: { id: true, name: true, jobTitle: true } } },
  });
  for (const v of vinculos) por.set(v.unitId, [...(por.get(v.unitId) ?? []), v.collaborator]);
  return por;
}

async function semVinculoNoEscopo(user: SessionUser): Promise<HeSemVinculo[]> {
  return prisma.paymentRequest.findMany({
    where: { ...escopo(user), type: 'OVERTIME', collaboratorId: null },
    select: { id: true, unitId: true, collaboratorName: true },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
}

/**
 * Vincula sozinho o que não tem dúvida. Idempotente: a HE já vinculada não
 * entra no `where`. Devolve quantas vinculou e quantas ficaram para a fila.
 */
export async function vincularAutomaticamente(user: SessionUser, ctx: Ctx = {}): Promise<{ vinculadas: number; pendentes: number }> {
  if (!PODE_VINCULAR.has(user.role)) return { vinculadas: 0, pendentes: 0 };
  const hes = await semVinculoNoEscopo(user);
  const por = await colaboradoresPorUnidade([...new Set(hes.map((h) => h.unitId))]);
  let vinculadas = 0;
  for (const h of hes) {
    const { exatos } = candidatosDeVinculo(h.collaboratorName ?? '', por.get(h.unitId) ?? []);
    if (exatos.length !== 1) continue;
    const r = await prisma.paymentRequest.updateMany({ where: { id: h.id, collaboratorId: null }, data: { collaboratorId: exatos[0].id } });
    if (r.count === 0) continue;
    vinculadas += 1;
    await audit({ userId: user.id, unitId: h.unitId, action: 'PAYMENT_HE_VINCULO_RH', module: 'PAYMENTS', entity: 'payment_request', entityId: h.id, metadata: { auto: true, nome: h.collaboratorName, collaboratorId: exatos[0].id, colaborador: exatos[0].name }, ...ctx });
  }
  return { vinculadas, pendentes: hes.length - vinculadas };
}

export interface PendenciaDeVinculo {
  id: string;
  unitId: string;
  unidade: string;
  nome: string;
  dia: string | null;
  valor: number;
  /** Candidatos do cadastro da unidade: os parecidos primeiro, depois todos. */
  sugestoes: CandidatoRh[];
  opcoes: CandidatoRh[];
}

/** A fila manual: HE sem vínculo, com sugestões por semelhança de nome. */
export async function listarSemVinculo(user: SessionUser): Promise<PendenciaDeVinculo[]> {
  const rows = await prisma.paymentRequest.findMany({
    where: { ...escopo(user), type: 'OVERTIME', collaboratorId: null },
    select: { id: true, unitId: true, collaboratorName: true, workDate: true, amount: true, unit: { select: { name: true } } },
    orderBy: [{ collaboratorName: 'asc' }, { workDate: 'desc' }],
    take: 500,
  });
  const por = await colaboradoresPorUnidade([...new Set(rows.map((r) => r.unitId))]);
  return rows.map((r) => {
    const opcoes = por.get(r.unitId) ?? [];
    const { exatos, parecidos } = candidatosDeVinculo(r.collaboratorName ?? '', opcoes);
    return {
      id: r.id, unitId: r.unitId, unidade: r.unit.name, nome: r.collaboratorName ?? 'Colaborador',
      dia: r.workDate ? r.workDate.toISOString().slice(0, 10) : null, valor: Number(r.amount),
      sugestoes: [...exatos, ...parecidos], opcoes,
    };
  });
}

export type ResultadoVinculo = { ok: true } | { ok: false; reason: 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID' | 'STATE'; detail?: string };

/** O Admin/Supervisão escolhe: mesma porta de `colaboradorDaUnidade` (ativo e da unidade da HE). */
export async function vincularManual(user: SessionUser, heId: string, collaboratorId: string, ctx: Ctx = {}): Promise<ResultadoVinculo> {
  if (!PODE_VINCULAR.has(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const he = await prisma.paymentRequest.findUnique({ where: { id: heId }, select: { id: true, type: true, unitId: true, collaboratorId: true, collaboratorName: true } });
  if (!he || he.type !== 'OVERTIME') return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, he.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (he.collaboratorId) return { ok: false, reason: 'STATE', detail: 'Esta hora extra já está vinculada a um colaborador.' };
  const c = await colaboradorDaUnidade(collaboratorId, he.unitId);
  if (!c.ok) return { ok: false, reason: 'INVALID', detail: c.detail };
  await prisma.paymentRequest.update({ where: { id: he.id }, data: { collaboratorId: c.id } });
  await audit({ userId: user.id, unitId: he.unitId, action: 'PAYMENT_HE_VINCULO_RH', module: 'PAYMENTS', entity: 'payment_request', entityId: he.id, metadata: { auto: false, nome: he.collaboratorName, collaboratorId: c.id, colaborador: c.name }, ...ctx });
  return { ok: true };
}
