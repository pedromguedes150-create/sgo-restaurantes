import { prisma } from '@/lib/db/prisma';
import { assertUnitAccess, UnitScopeError, unitScopeWhere, canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyUnitRole, notifyAdmins, notifyUsers } from '@/lib/notifications';
import { enfileirarDesligamento, envioDeCadaRegistro, type EnvioResumido } from '@/lib/rh/saida/fila';
import { validarDesligamento, tipoSemAviso } from '@/lib/rh/saida/regras';
import type { SessionUser } from '@/lib/auth/session';
import { RhNoticeMode, RhTerminationKind, RhTerminationReason, type NoticeType } from '@prisma/client';

type Ctx = { ip?: string | null; userAgent?: string | null };

/** Tempo de empresa (texto) a partir da data de admissão 'YYYY-MM-DD'. */
export function tenureText(hireDate: string | null): string | null {
  if (!hireDate || !/^\d{4}-\d{2}-\d{2}$/.test(hireDate)) return null;
  const [y, m, d] = hireDate.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const now = new Date();
  let months = (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + (now.getUTCMonth() - start.getUTCMonth());
  if (now.getUTCDate() < d) months -= 1;
  if (months < 0) months = 0;
  const yy = Math.floor(months / 12), mm = months % 12;
  const parts = [];
  if (yy > 0) parts.push(`${yy} ano${yy > 1 ? 's' : ''}`);
  parts.push(`${mm} ${mm === 1 ? 'mês' : 'meses'}`);
  return parts.join(', ');
}

/** Contexto do colaborador p/ o formulário: admissão/tempo de empresa + atestados + se tem CPF. */
export async function getTerminationContext(user: SessionUser, collaboratorId: string) {
  const c = await prisma.collaborator.findUnique({ where: { id: collaboratorId }, select: { name: true, hireDate: true, cpf: true } });
  if (!c) return null;
  const certs = await prisma.medicalCertificate.findMany({ where: { collaboratorId }, select: { days: true } });
  const certCount = certs.length;
  const certDays = certs.reduce((s, x) => s + (x.days ?? 0), 0);
  return { name: c.name, hireDate: c.hireDate, tenure: tenureText(c.hireDate), certCount, certDays, temCpf: String(c.cpf ?? '').replace(/\D/g, '').length === 11 };
}

/* Rótulos do contrato do RH, para a tela e o relatório. */
export const TIPOS_DESLIGAMENTO: { value: RhTerminationKind; label: string }[] = [
  { value: 'DISPENSA_SEM_JUSTA_CAUSA', label: 'Dispensa sem justa causa' },
  { value: 'JUSTA_CAUSA', label: 'Justa causa' },
  { value: 'PEDIDO_DEMISSAO', label: 'Pedido de demissão (carta obrigatória)' },
  { value: 'ACORDO_484A', label: 'Acordo (art. 484-A)' },
  { value: 'TERMINO_EXPERIENCIA', label: 'Término do contrato de experiência' },
];
export const MODALIDADES_AVISO: { value: RhNoticeMode; label: string }[] = [
  { value: 'TRABALHADO_2H', label: 'Trabalhado — redução de 2h/dia' },
  { value: 'TRABALHADO_7DIAS', label: 'Trabalhado — 7 dias corridos' },
  { value: 'INDENIZADO', label: 'Indenizado' },
  { value: 'NAO_CUMPRIDO', label: 'Não cumprido' },
];
export const MOTIVOS_DESLIGAMENTO: { value: RhTerminationReason; label: string }[] = [
  { value: 'DESEMPENHO', label: 'Desempenho' },
  { value: 'COMPORTAMENTO', label: 'Comportamento' },
  { value: 'FALTAS_ATRASOS', label: 'Faltas / atrasos' },
  { value: 'REDUCAO_QUADRO', label: 'Redução de quadro' },
  { value: 'FIM_EXPERIENCIA', label: 'Fim da experiência' },
  { value: 'OUTRA_OPORTUNIDADE', label: 'Outra oportunidade' },
  { value: 'MOTIVO_PESSOAL', label: 'Motivo pessoal' },
  { value: 'SAUDE', label: 'Saúde' },
  { value: 'OUTRO', label: 'Outro (justificar)' },
];

export interface CreateTerminationInput {
  unitId: string; collaboratorId: string;
  terminationKind: string; noticeMode?: string | null; reasonCode: string; terminationDate: string;
  /** Texto livre: justificativa (motivo "Outro") ou observação. */
  reason: string;
  letterPath?: string | null;
  noticeJustification?: string; ageYears?: number;
}
export type TermResult = { ok: true; id: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND'; message?: string };

/** O aviso legado (trabalhado/indenizado) derivado da modalidade do RH — mantém relatório e histórico legíveis. */
function noticeTypeDe(mode: RhNoticeMode | null): NoticeType | null {
  if (!mode) return null;
  return mode === 'TRABALHADO_2H' || mode === 'TRABALHADO_7DIAS' ? 'WORKED' : 'INDEMNIFIED';
}

export async function createTermination(user: SessionUser, input: CreateTerminationInput, ctx: Ctx = {}): Promise<TermResult> {
  try { assertUnitAccess(user, input.unitId); } catch (e) {
    if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' };
    throw e;
  }
  if (!input.collaboratorId) return { ok: false, reason: 'INVALID', message: 'Escolha o colaborador.' };
  const kind = input.terminationKind as RhTerminationKind;
  const reasonCode = input.reasonCode as RhTerminationReason;
  const mode = (input.noticeMode || null) as RhNoticeMode | null;
  if (!Object.values(RhTerminationKind).includes(kind)) return { ok: false, reason: 'INVALID', message: 'Escolha o tipo do desligamento.' };
  if (!Object.values(RhTerminationReason).includes(reasonCode)) return { ok: false, reason: 'INVALID', message: 'Escolha o motivo.' };
  if (mode && !Object.values(RhNoticeMode).includes(mode)) return { ok: false, reason: 'INVALID', message: 'Modalidade de aviso inválida.' };
  const reason = (input.reason ?? '').trim();
  const v = validarDesligamento({ terminationKind: kind, noticeMode: mode, reasonCode, terminationDate: String(input.terminationDate ?? ''), reason, letterPath: input.letterPath ?? null });
  if (!v.ok) return { ok: false, reason: 'INVALID', message: v.motivo };

  const link = await prisma.collaboratorUnit.findUnique({ where: { collaboratorId_unitId: { collaboratorId: input.collaboratorId, unitId: input.unitId } }, select: { id: true } });
  if (!link) return { ok: false, reason: 'NOT_FOUND', message: 'Este colaborador não está vinculado a esta unidade.' };
  const ctx2 = await getTerminationContext(user, input.collaboratorId);
  if (!ctx2) return { ok: false, reason: 'NOT_FOUND' };

  const rec = await prisma.termination.create({
    data: {
      unitId: input.unitId, collaboratorId: input.collaboratorId, requestedById: user.id,
      terminationKind: kind, noticeMode: v.noticeMode, reasonCode, terminationDate: input.terminationDate, letterPath: input.letterPath || null,
      noticeType: noticeTypeDe(v.noticeMode), noticeJustification: input.noticeJustification?.trim() || null,
      reason: reason || MOTIVOS_DESLIGAMENTO.find((m) => m.value === reasonCode)?.label || reasonCode,
      collaboratorName: ctx2.name, ageYears: input.ageYears && input.ageYears > 0 ? Math.trunc(input.ageYears) : null,
      tenureText: ctx2.tenure, certCount: ctx2.certCount, certDays: ctx2.certDays,
    },
    select: { id: true },
  });
  await audit({ userId: user.id, unitId: input.unitId, action: 'TERMINATION_REQUEST', module: 'PEOPLE', entity: 'termination', entityId: rec.id, metadata: { terminationKind: kind, noticeMode: v.noticeMode, reasonCode, terminationDate: input.terminationDate, comCarta: Boolean(input.letterPath) }, ...ctx });
  const unit = await prisma.unit.findUnique({ where: { id: input.unitId }, select: { name: true } });
  const payload = { title: 'Solicitação de desligamento', body: `${user.name} solicitou o desligamento de ${ctx2.name} (${unit?.name ?? ''}). Aprove ou recuse.`, link: '/modulos/desligamentos', module: 'PEOPLE' as const };
  await notifyUnitRole(input.unitId, 'SUPERVISOR', payload);
  await notifyAdmins(payload);
  return { ok: true, id: rec.id };
}

/**
 * Supervisor/Admin/CEO decide. Quem pediu NÃO aprova o próprio pedido
 * (decisão do Pedro, 14/10/2026). Aprovado → entra na fila de envio ao RH
 * (só pedidos no formato novo, com tipo/motivo/data).
 */
export async function decideTermination(user: SessionUser, id: string, approve: boolean, rejectionReason: string | undefined, ctx: Ctx = {}): Promise<TermResult> {
  if (!['SUPERVISOR', 'ADMIN', 'CEO'].includes(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const t = await prisma.termination.findUnique({ where: { id }, select: { unitId: true, status: true, requestedById: true, collaboratorName: true, terminationKind: true } });
  if (!t) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, t.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (t.requestedById === user.id) return { ok: false, reason: 'FORBIDDEN', message: 'Quem solicitou não pode aprovar o próprio pedido.' };
  if (t.status !== 'PENDING') return { ok: false, reason: 'INVALID' };
  if (!approve && !rejectionReason?.trim()) return { ok: false, reason: 'INVALID' };

  await prisma.termination.update({
    where: { id },
    data: { status: approve ? 'APPROVED' : 'REJECTED', approvedById: user.id, approvedAt: new Date(), rejectionReason: approve ? null : rejectionReason!.trim() },
  });
  await audit({ userId: user.id, unitId: t.unitId, action: approve ? 'TERMINATION_APPROVE' : 'TERMINATION_REJECT', module: 'PEOPLE', entity: 'termination', entityId: id, ...ctx });

  const enviaAoRh = approve && Boolean(t.terminationKind);
  if (enviaAoRh) await enfileirarDesligamento(id, t.requestedById ?? user.id).catch((e) => console.error('[rh-saida] falha ao enfileirar desligamento:', e));

  if (t.requestedById) {
    await notifyUsers([t.requestedById], {
      title: approve ? '✅ Desligamento aprovado' : '❌ Desligamento recusado',
      body: `${t.collaboratorName}: ${approve ? (enviaAoRh ? 'aprovado pelo supervisor — o pedido vai ao RH automaticamente; acompanhe o andamento em Desligamentos.' : 'aprovado pelo supervisor — encaminhar ao RH.') : `recusado — ${rejectionReason!.trim()}`}`,
      link: '/modulos/desligamentos', module: 'PEOPLE',
    });
  }
  return { ok: true, id };
}

export async function listTerminations(user: SessionUser) {
  const rows = await prisma.termination.findMany({
    where: { ...unitScopeWhere(user, 'unitId') },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 200,
    include: { unit: { select: { name: true } }, requestedBy: { select: { name: true } }, approvedBy: { select: { name: true } } },
  });
  const envio = await envioDeCadaRegistro('DESLIGAMENTO', rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, envio: (envio.get(r.id) ?? 'NAO_ENVIADO') as EnvioResumido }));
}

export async function getTermination(user: SessionUser, id: string) {
  const t = await prisma.termination.findUnique({ where: { id }, include: { unit: { select: { name: true, code: true } }, requestedBy: { select: { name: true } }, approvedBy: { select: { name: true } } } });
  if (!t || !canAccessUnit(user, t.unitId)) return null;
  return t;
}

export { tipoSemAviso };
