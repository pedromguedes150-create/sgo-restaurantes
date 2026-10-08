import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyUsers } from '@/lib/notifications';
import { hojeNaOperacao } from '@/lib/controle-gerentes-dados';
import type { SessionUser } from '@/lib/auth/session';
import { situacaoDoPlano, type SituacaoPlano, type StatusPlano } from '@/lib/people/avaliacao-painel-calculo';

/**
 * PLANO DE DESENVOLVIMENTO INDIVIDUAL + REVISÃO DA AVALIAÇÃO (v1.162.0).
 *
 * Plano = ação combinada com o colaborador (critério, ação/treinamento,
 * responsável, prazo, situação). Quem avalia cadastra e acompanha; o
 * responsável é avisado. "Vencido" é derivado do prazo, nunca gravado.
 *
 * Revisão = a Supervisão pede ao avaliador que reveja uma avaliação, com
 * motivo. Fica ABERTA na linha até o avaliador salvar de novo (quem resolve é
 * `saveEvaluation`, que carimba `reviewResolvedAt`). Tudo auditado.
 */

type Ctx = { ip?: string | null; userAgent?: string | null };
export type ResultadoPlano = { ok: true; id: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' | 'JA_ABERTA'; detalhe?: string };

export const PERFIS_QUE_PLANEJAM = ['MANAGER', 'COORDINATOR', 'SUPERVISOR', 'ADMIN'] as const;
export const PERFIS_QUE_REVISAM = ['SUPERVISOR', 'ADMIN', 'CEO'] as const;
export const podePlanejar = (role: string) => (PERFIS_QUE_PLANEJAM as readonly string[]).includes(role);
export const podeRevisar = (role: string) => (PERFIS_QUE_REVISAM as readonly string[]).includes(role);

const ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;

export interface PlanoListado {
  id: string; evaluationId: string | null; yearMonth: string; criterionKey: string | null; criterionLabel: string; action: string;
  responsibleId: string | null; responsibleName: string; dueDate: string; status: StatusPlano; situacao: SituacaoPlano; note: string | null;
  createdByName: string; createdAt: string; completedAt: string | null;
}

async function colaboradorNoAlcance(user: SessionUser, collaboratorId: string) {
  const c = await prisma.collaborator.findUnique({ where: { id: collaboratorId }, select: { name: true, units: { select: { unitId: true } } } });
  if (!c) return null;
  const unitId = c.units.find((u) => canAccessUnit(user, u.unitId))?.unitId;
  return unitId ? { name: c.name, unitId } : null;
}

export async function listarPlanos(user: SessionUser, collaboratorId: string, hoje = hojeNaOperacao()): Promise<PlanoListado[]> {
  if (!(await colaboradorNoAlcance(user, collaboratorId))) return [];
  const rows = await prisma.developmentPlan.findMany({ where: { collaboratorId }, orderBy: [{ status: 'asc' }, { dueDate: 'asc' }] });
  return rows.map((p) => {
    const dueDate = p.dueDate.toISOString().slice(0, 10);
    return {
      id: p.id, evaluationId: p.evaluationId, yearMonth: p.yearMonth, criterionKey: p.criterionKey, criterionLabel: p.criterionLabel, action: p.action,
      responsibleId: p.responsibleId, responsibleName: p.responsibleName, dueDate, status: p.status, situacao: situacaoDoPlano({ status: p.status, dueDate }, hoje),
      note: p.note, createdByName: p.createdByName, createdAt: p.createdAt.toISOString(), completedAt: p.completedAt?.toISOString() ?? null,
    };
  });
}

export interface EntradaPlano {
  collaboratorId: string; evaluationId?: string | null; yearMonth: string; criterionKey?: string | null; criterionLabel: string;
  action: string; responsibleId?: string | null; responsibleName?: string; dueDate: string; note?: string;
}

export async function criarPlano(user: SessionUser, input: EntradaPlano, ctx: Ctx = {}): Promise<ResultadoPlano> {
  if (!podePlanejar(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const alc = await colaboradorNoAlcance(user, input.collaboratorId);
  if (!alc) return { ok: false, reason: 'NOT_FOUND' };
  const criterionLabel = (input.criterionLabel ?? '').trim();
  const action = (input.action ?? '').trim();
  if (!criterionLabel || criterionLabel.length > 120) return { ok: false, reason: 'INVALID', detalhe: 'Informe o critério a melhorar.' };
  if (!action || action.length > 1000) return { ok: false, reason: 'INVALID', detalhe: 'Descreva a ação corretiva ou o treinamento (até 1000 letras).' };
  if (!ISO_DIA.test(input.dueDate)) return { ok: false, reason: 'INVALID', detalhe: 'Informe o prazo.' };
  if (!/^\d{4}-\d{2}$/.test(input.yearMonth)) return { ok: false, reason: 'INVALID' };
  let responsibleName = (input.responsibleName ?? '').trim();
  let responsibleId = input.responsibleId ?? null;
  if (responsibleId) {
    const r = await prisma.user.findUnique({ where: { id: responsibleId }, select: { name: true, active: true } });
    if (!r || !r.active) return { ok: false, reason: 'INVALID', detalhe: 'Responsável não encontrado.' };
    responsibleName = r.name;
  } else if (!responsibleName) { responsibleId = user.id; responsibleName = user.name; }
  if (responsibleName.length > 120) return { ok: false, reason: 'INVALID' };
  if (input.evaluationId) {
    const e = await prisma.collaboratorEvaluation.findUnique({ where: { id: input.evaluationId }, select: { collaboratorId: true } });
    if (!e || e.collaboratorId !== input.collaboratorId) return { ok: false, reason: 'INVALID', detalhe: 'Avaliação não pertence a este colaborador.' };
  }
  const p = await prisma.developmentPlan.create({
    data: {
      evaluationId: input.evaluationId ?? null, collaboratorId: input.collaboratorId, collaboratorName: alc.name, unitId: alc.unitId, yearMonth: input.yearMonth,
      criterionKey: input.criterionKey ?? null, criterionLabel, action, responsibleId, responsibleName,
      dueDate: new Date(input.dueDate + 'T12:00:00Z'), note: (input.note ?? '').trim().slice(0, 1000) || null, createdById: user.id, createdByName: user.name,
    },
  });
  await audit({ userId: user.id, unitId: alc.unitId, action: 'PDI_CREATE', module: 'PEOPLE', entity: 'development_plan', entityId: p.id, metadata: { colaborador: alc.name, criterio: criterionLabel, acao: action, responsavel: responsibleName, prazo: input.dueDate }, ...ctx });
  if (responsibleId && responsibleId !== user.id) {
    await notifyUsers([responsibleId], { title: `Plano de desenvolvimento: ${alc.name}`, body: `${criterionLabel} — ${action.slice(0, 120)}. Prazo ${input.dueDate.split('-').reverse().join('/')}.`, link: `/modulos/pessoas/avaliacao?mes=${input.yearMonth}`, module: 'PEOPLE' });
  }
  return { ok: true, id: p.id };
}

export async function atualizarPlano(user: SessionUser, id: string, input: { status?: StatusPlano; note?: string; action?: string; dueDate?: string }, ctx: Ctx = {}): Promise<ResultadoPlano> {
  if (!podePlanejar(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const p = await prisma.developmentPlan.findUnique({ where: { id } });
  if (!p) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, p.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const data: { status?: StatusPlano; completedAt?: Date | null; note?: string | null; action?: string; dueDate?: Date } = {};
  if (input.status !== undefined) {
    if (!['PENDING', 'IN_PROGRESS', 'DONE'].includes(input.status)) return { ok: false, reason: 'INVALID' };
    data.status = input.status;
    data.completedAt = input.status === 'DONE' ? new Date() : null;
  }
  if (input.note !== undefined) data.note = input.note.trim().slice(0, 1000) || null;
  if (input.action !== undefined) {
    const a = input.action.trim();
    if (!a || a.length > 1000) return { ok: false, reason: 'INVALID' };
    data.action = a;
  }
  if (input.dueDate !== undefined) {
    if (!ISO_DIA.test(input.dueDate)) return { ok: false, reason: 'INVALID' };
    data.dueDate = new Date(input.dueDate + 'T12:00:00Z');
  }
  await prisma.developmentPlan.update({ where: { id }, data });
  await audit({ userId: user.id, unitId: p.unitId, action: 'PDI_UPDATE', module: 'PEOPLE', entity: 'development_plan', entityId: id, metadata: { colaborador: p.collaboratorName, antes: { status: p.status, action: p.action, dueDate: p.dueDate.toISOString().slice(0, 10) }, depois: { ...data, dueDate: data.dueDate?.toISOString().slice(0, 10), completedAt: undefined } }, ...ctx });
  return { ok: true, id };
}

/** A Supervisão pede revisão de uma avaliação, com motivo; o avaliador é avisado. */
export async function solicitarRevisao(user: SessionUser, evaluationId: string, reason: string, ctx: Ctx = {}): Promise<ResultadoPlano> {
  if (!podeRevisar(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const motivo = (reason ?? '').trim();
  if (!motivo || motivo.length > 500) return { ok: false, reason: 'INVALID', detalhe: 'Diga o motivo da revisão (até 500 letras).' };
  const e = await prisma.collaboratorEvaluation.findUnique({ where: { id: evaluationId }, select: { unitId: true, collaboratorName: true, yearMonth: true, evaluatorId: true, reviewRequestedAt: true, reviewResolvedAt: true } });
  if (!e) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, e.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (e.reviewRequestedAt && !e.reviewResolvedAt) return { ok: false, reason: 'JA_ABERTA', detalhe: 'Já há uma revisão aberta para esta avaliação.' };
  await prisma.collaboratorEvaluation.update({ where: { id: evaluationId }, data: { reviewRequestedById: user.id, reviewRequestedByName: user.name, reviewRequestedAt: new Date(), reviewReason: motivo, reviewResolvedAt: null } });
  await audit({ userId: user.id, unitId: e.unitId, action: 'EVALUATION_REVIEW_REQUESTED', module: 'PEOPLE', entity: 'collaborator_evaluation', entityId: evaluationId, metadata: { colaborador: e.collaboratorName, yearMonth: e.yearMonth, motivo }, ...ctx });
  await notifyUsers([e.evaluatorId], { title: `Revisão pedida: avaliação de ${e.collaboratorName}`, body: `${user.name}: ${motivo.slice(0, 160)}`, link: `/modulos/pessoas/avaliacao?mes=${e.yearMonth}`, module: 'PEOPLE', nivel: 'IMPORTANTE' });
  return { ok: true, id: evaluationId };
}
