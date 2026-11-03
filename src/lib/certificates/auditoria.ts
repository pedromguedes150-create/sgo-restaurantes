import { prisma } from '@/lib/db/prisma';
import { assertUnitAccess, canAccessUnit, unitScopeWhere, UnitScopeError } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyUnitRole, notifySupervisory, notifyUsers } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';
import type { CertificateReviewStatus } from '@prisma/client';
import { carregarConfigDaMeta, type ConfigDaMeta } from '@/lib/metas/vigencia';
import { CHAVE_PEN_ATESTADOS_80, CHAVE_PEN_ATESTADOS_90, CHAVE_PEN_ATESTADOS_ABAIXO_80, CHAVE_PRAZO_ATESTADOS } from '@/lib/metas/vigencia-regras';
import {
  componenteDeAtestados, conformidade, DATA_RE, montarFaixas, MOTIVO_MIN, podeAuditar, podeConfirmarFalha, podeJustificar, prazoDeLancamento,
  situacaoDoEsperado, sobrepoe, type CalendarioUtil, type Conformidade, type Faixa, type SituacaoDaAuditoria,
} from './auditoria-regras';

/**
 * AUDITORIA DE ATESTADOS — leitura e gravação (v1.181.0). As regras vivem em
 * `auditoria-regras.ts`; aqui é banco, escopo, auditoria e avisos.
 *
 * Independente da API do RH: o esperado é INFORMADO (RH = Admin, supervisão,
 * coordenação). Nada aqui altera `MedicalCertificate`; o cruzamento só grava
 * `certificateId` no esperado.
 */

type Ctx = { ip?: string | null; userAgent?: string | null };
export type ResultadoDaAuditoria = { ok: true; id: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' | 'NO_LINK' | 'DUPLICATE' | 'ESTADO'; message?: string };

/** Feriados cadastrados (Configurações → Feriados) como conjunto de dias. */
async function calendario(): Promise<CalendarioUtil> {
  const feriados = await prisma.holiday.findMany({ select: { date: true } });
  return { feriados: new Set(feriados.map((f) => f.date)), pulaDomingo: true };
}
function faixasDe(vig: ConfigDaMeta): Faixa[] {
  return montarFaixas({ pen90: vig.parametro(CHAVE_PEN_ATESTADOS_90), pen80: vig.parametro(CHAVE_PEN_ATESTADOS_80), penAbaixo80: vig.parametro(CHAVE_PEN_ATESTADOS_ABAIXO_80) });
}

/* ───────────────────────── cruzamento ───────────────────────── */

/** Liga um esperado ao atestado do SGO (colaborador + unidade + período sobreposto), se existir e ainda estiver livre. */
export async function cruzarEsperado(expectationId: string): Promise<boolean> {
  const e = await prisma.certificateExpectation.findUnique({ where: { id: expectationId } });
  if (!e || e.certificateId) return false;
  const candidatos = await prisma.medicalCertificate.findMany({
    where: { collaboratorId: e.collaboratorId, unitId: e.unitId, startDate: { lte: e.endDate }, endDate: { gte: e.startDate }, expectation: null },
    orderBy: { createdAt: 'asc' }, select: { id: true },
  });
  if (candidatos.length === 0) return false;
  await prisma.certificateExpectation.update({ where: { id: e.id }, data: { certificateId: candidatos[0].id, linkedAt: new Date() } });
  return true;
}

/** Chamado por `createCertificate`: o atestado recém-lançado procura o esperado que ainda não tem lançamento. */
export async function cruzarAtestado(certificateId: string): Promise<boolean> {
  const c = await prisma.medicalCertificate.findUnique({ where: { id: certificateId }, select: { id: true, collaboratorId: true, unitId: true, startDate: true, endDate: true, expectation: { select: { id: true } } } });
  if (!c || c.expectation) return false;
  const esperados = await prisma.certificateExpectation.findMany({
    where: { collaboratorId: c.collaboratorId, unitId: c.unitId, certificateId: null, reviewStatus: { not: 'INVALIDO' }, startDate: { lte: c.endDate }, endDate: { gte: c.startDate } },
    orderBy: { createdAt: 'asc' }, select: { id: true },
  });
  if (esperados.length === 0) return false;
  await prisma.certificateExpectation.update({ where: { id: esperados[0].id }, data: { certificateId: c.id, linkedAt: new Date() } });
  return true;
}

/* ───────────────────────── gravação ───────────────────────── */

export interface InformarEsperadoInput {
  unitId: string;
  collaboratorId: string;
  startDate: string;
  endDate: string;
  /** ISO datetime da ciência do gerente. */
  noticeAt: string;
  receivedByName?: string;
  note?: string;
}

/** RH/supervisão informam o atestado que o gerente deveria lançar. */
export async function informarAtestadoEsperado(user: SessionUser, input: InformarEsperadoInput, ctx: Ctx = {}): Promise<ResultadoDaAuditoria> {
  if (!podeAuditar(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  try { assertUnitAccess(user, input.unitId); } catch (e) { if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' }; throw e; }
  if (!input.collaboratorId || !DATA_RE.test(input.startDate ?? '') || !DATA_RE.test(input.endDate ?? '') || input.endDate < input.startDate) return { ok: false, reason: 'INVALID', message: 'Confira colaborador e período.' };
  const noticeAt = new Date(input.noticeAt ?? '');
  if (Number.isNaN(noticeAt.getTime())) return { ok: false, reason: 'INVALID', message: 'Informe quando o gerente tomou ciência do atestado.' };
  if (noticeAt.getTime() > Date.now() + 60_000) return { ok: false, reason: 'INVALID', message: 'A ciência não pode estar no futuro.' };

  const link = await prisma.collaboratorUnit.findUnique({ where: { collaboratorId_unitId: { collaboratorId: input.collaboratorId, unitId: input.unitId } }, select: { id: true } });
  if (!link) return { ok: false, reason: 'NO_LINK' };

  /* Duplicidade: o mesmo colaborador com esperado que se sobrepõe ao período (inválido não conta). */
  const dup = await prisma.certificateExpectation.findFirst({
    where: { collaboratorId: input.collaboratorId, reviewStatus: { not: 'INVALIDO' }, startDate: { lte: input.endDate }, endDate: { gte: input.startDate } },
    select: { id: true, startDate: true, endDate: true },
  });
  if (dup) return { ok: false, reason: 'DUPLICATE', message: `Já existe um atestado esperado deste colaborador de ${br(dup.startDate)} a ${br(dup.endDate)}.` };

  const rec = await prisma.certificateExpectation.create({
    data: {
      unitId: input.unitId, collaboratorId: input.collaboratorId, startDate: input.startDate, endDate: input.endDate, noticeAt,
      receivedByName: input.receivedByName?.trim() || null, source: 'MANUAL', informedById: user.id, informedByName: user.name, note: input.note?.trim() || null,
    },
    select: { id: true },
  });
  const cruzou = await cruzarEsperado(rec.id);
  await audit({ userId: user.id, unitId: input.unitId, action: 'CERT_EXPECTATION_CREATE', module: 'PEOPLE', entity: 'certificate_expectation', entityId: rec.id, metadata: { collaboratorId: input.collaboratorId, start: input.startDate, end: input.endDate, noticeAt: noticeAt.toISOString(), cruzou }, ...ctx });

  if (!cruzou) {
    const [vig, cal, colab] = await Promise.all([carregarConfigDaMeta(input.startDate.slice(0, 7)), calendario(), prisma.collaborator.findUnique({ where: { id: input.collaboratorId }, select: { name: true } })]);
    const prazo = prazoDeLancamento(noticeAt, vig.parametro(CHAVE_PRAZO_ATESTADOS), cal);
    await notifyUnitRole(input.unitId, 'MANAGER', {
      title: 'Atestado a lançar no SGO',
      body: `${user.name} informou um atestado de ${colab?.name ?? 'colaborador'} (${br(input.startDate)} a ${br(input.endDate)}). Prazo para lançar: ${horaBR(prazo)}.`,
      link: '/modulos/atestados', module: 'PEOPLE',
    }).catch(() => {});
  }
  return { ok: true, id: rec.id };
}

/** O gerente (ou a supervisão) justifica o atraso/omissão. Só vale depois de aprovada. */
export async function justificarEsperado(user: SessionUser, id: string, texto: string, ctx: Ctx = {}): Promise<ResultadoDaAuditoria> {
  if (!podeJustificar(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const e = await prisma.certificateExpectation.findUnique({ where: { id } });
  if (!e) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, e.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (String(texto ?? '').trim().length < MOTIVO_MIN) return { ok: false, reason: 'INVALID', message: `A justificativa precisa de pelo menos ${MOTIVO_MIN} caracteres.` };
  if (e.reviewStatus === 'JUSTIFICADO' || e.reviewStatus === 'INVALIDO') return { ok: false, reason: 'ESTADO', message: 'Este esperado já foi decidido pela supervisão.' };
  await prisma.certificateExpectation.update({ where: { id }, data: { justification: texto.trim(), justifiedById: user.id, justifiedByName: user.name, justifiedAt: new Date() } });
  await audit({ userId: user.id, unitId: e.unitId, action: 'CERT_EXPECTATION_JUSTIFY', module: 'PEOPLE', entity: 'certificate_expectation', entityId: id, metadata: { justificativa: texto.trim() }, ...ctx });
  await notifySupervisory({ title: 'Justificativa de atestado para aprovar', body: `${user.name} justificou um lançamento de atestado (${br(e.startDate)} a ${br(e.endDate)}). Aprove ou recuse na Auditoria de atestados.`, link: '/modulos/atestados', module: 'PEOPLE' }, e.unitId).catch(() => {});
  return { ok: true, id };
}

export type DecisaoDaRevisao = 'FALHA' | 'JUSTIFICADO' | 'INVALIDO' | 'REABRIR';
export interface RevisarInput { decisao: DecisaoDaRevisao; nota?: string; /** Quem deveria ter lançado — a responsabilidade individual só nasce aqui, validada. */ responsibleUserId?: string | null }

/** A supervisão decide: confirma a falha (e atribui a responsabilidade), aceita a justificativa, invalida ou reabre. */
export async function revisarEsperado(user: SessionUser, id: string, input: RevisarInput, ctx: Ctx = {}): Promise<ResultadoDaAuditoria> {
  if (!podeAuditar(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const e = await prisma.certificateExpectation.findUnique({ where: { id }, include: { certificate: { select: { createdAt: true } } } });
  if (!e) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, e.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const agora = new Date();
  const [vig, cal] = await Promise.all([carregarConfigDaMeta(e.startDate.slice(0, 7)), calendario()]);
  const prazoAte = prazoDeLancamento(e.noticeAt, vig.parametro(CHAVE_PRAZO_ATESTADOS), cal);
  const fatos = { reviewStatus: 'AGUARDANDO' as const, lancadoEm: e.certificate?.createdAt ?? null, prazoAte };

  let data: Record<string, unknown> = { reviewNote: input.nota?.trim() || null, reviewedById: user.id, reviewedByName: user.name, reviewedAt: agora };
  if (input.decisao === 'FALHA') {
    if (!podeConfirmarFalha(fatos, agora)) return { ok: false, reason: 'ESTADO', message: 'Só dá para confirmar a falha com o prazo vencido e sem lançamento no prazo.' };
    let responsavel: { id: string; name: string } | null = null;
    if (input.responsibleUserId) {
      responsavel = await prisma.user.findFirst({ where: { id: input.responsibleUserId, active: true, role: { in: ['MANAGER', 'COORDINATOR'] }, memberships: { some: { unitId: e.unitId } } }, select: { id: true, name: true } });
      if (!responsavel) return { ok: false, reason: 'INVALID', message: 'O responsável precisa ser gerente ou coordenador desta unidade.' };
    }
    data = { ...data, reviewStatus: 'FALHA_CONFIRMADA', responsibleUserId: responsavel?.id ?? null, responsibleName: responsavel?.name ?? null, responsibilityValidatedAt: responsavel ? agora : null };
  } else if (input.decisao === 'JUSTIFICADO') {
    if (!e.justification) return { ok: false, reason: 'ESTADO', message: 'Não há justificativa para aprovar.' };
    data = { ...data, reviewStatus: 'JUSTIFICADO' };
  } else if (input.decisao === 'INVALIDO') {
    if (String(input.nota ?? '').trim().length < MOTIVO_MIN) return { ok: false, reason: 'INVALID', message: `Diga por que o esperado não procede (mínimo ${MOTIVO_MIN} caracteres).` };
    data = { ...data, reviewStatus: 'INVALIDO' };
  } else if (input.decisao === 'REABRIR') {
    data = { ...data, reviewStatus: 'AGUARDANDO', responsibleUserId: null, responsibleName: null, responsibilityValidatedAt: null };
  } else {
    return { ok: false, reason: 'INVALID' };
  }
  await prisma.certificateExpectation.update({ where: { id }, data });
  await audit({ userId: user.id, unitId: e.unitId, action: 'CERT_EXPECTATION_REVIEW', module: 'PEOPLE', entity: 'certificate_expectation', entityId: id, metadata: { de: e.reviewStatus, decisao: input.decisao, nota: input.nota?.trim() || null, responsavel: (data.responsibleName as string | null) ?? null }, ...ctx });
  const aviso = input.decisao === 'FALHA' ? 'Falha de lançamento de atestado confirmada' : input.decisao === 'JUSTIFICADO' ? 'Justificativa de atestado aprovada' : input.decisao === 'INVALIDO' ? 'Atestado esperado invalidado' : 'Auditoria de atestado reaberta';
  const destinatarios = data.responsibleUserId ? [data.responsibleUserId as string] : null;
  const payload = { title: aviso, body: `${user.name} decidiu sobre o atestado esperado de ${br(e.startDate)} a ${br(e.endDate)}${input.nota ? `: ${input.nota.trim()}` : '.'}`, link: '/modulos/atestados', module: 'PEOPLE' };
  await (destinatarios ? notifyUsers(destinatarios, payload) : notifyUnitRole(e.unitId, 'MANAGER', payload)).catch(() => {});
  return { ok: true, id };
}

/* ───────────────────────── leitura ───────────────────────── */

export interface EsperadoDaAuditoria {
  id: string;
  unitId: string; unitName: string;
  collaboratorId: string; collaboratorName: string;
  startDate: string; endDate: string;
  noticeAt: string; prazoAte: string;
  receivedByName: string | null;
  informedByName: string; source: 'MANUAL' | 'RH'; note: string | null;
  /** O lançamento cruzado, se houver. */
  lancamento: { id: string; lancadoEm: string; lancadoPor: string | null; atraso: boolean } | null;
  situacao: SituacaoDaAuditoria;
  justification: string | null; justifiedByName: string | null; justifiedAt: string | null;
  reviewStatus: CertificateReviewStatus; reviewNote: string | null; reviewedByName: string | null; reviewedAt: string | null;
  responsibleUserId: string | null; responsibleName: string | null; responsibilityValidatedAt: string | null;
}
export interface LinhaPorUnidade extends Conformidade { unitId: string; unitName: string; pontos: number | null; penalizacao: number | null }
export interface LinhaPorGerente { userId: string; name: string; unidades: string[]; falhasConfirmadas: number; lancamentos: number; lancamentosNoPrazo: number }
export interface AuditoriaDeAtestados {
  yearMonth: string;
  prazoHoras: number;
  faixas: Faixa[];
  esperados: EsperadoDaAuditoria[];
  rede: Conformidade & { pontos: number | null; penalizacao: number | null };
  porUnidade: LinhaPorUnidade[];
  /** Responsabilidade INDIVIDUAL: só falhas validadas pela supervisão; lançamentos = quem de fato lançou. */
  porGerente: LinhaPorGerente[];
  /** Quem pode ser responsável, por unidade (gerentes e coordenadores vinculados). */
  gerentesPorUnidade: Record<string, { id: string; name: string }[]>;
}

const br = (iso: string) => iso.split('-').reverse().join('/');
const horaBR = (d: Date) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

async function esperadosDoMes(where: Record<string, unknown>, yearMonth: string, vig: ConfigDaMeta, cal: CalendarioUtil, agora: Date) {
  const rows = await prisma.certificateExpectation.findMany({
    where: { ...where, startDate: { startsWith: yearMonth } },
    orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    include: { unit: { select: { name: true } }, collaborator: { select: { name: true } }, certificate: { select: { id: true, createdAt: true, createdBy: { select: { id: true, name: true } } } } },
  });
  const horas = vig.parametro(CHAVE_PRAZO_ATESTADOS);
  return rows.map((r) => {
    const prazoAte = prazoDeLancamento(r.noticeAt, horas, cal);
    const situacao = situacaoDoEsperado({ reviewStatus: r.reviewStatus, lancadoEm: r.certificate?.createdAt ?? null, prazoAte }, agora);
    return { r, prazoAte, situacao };
  });
}

/** A auditoria do mês no escopo do usuário (com filtro de unidade em AND). */
export async function getAuditoriaDeAtestados(user: SessionUser, yearMonth: string, unitId?: string): Promise<AuditoriaDeAtestados> {
  const agora = new Date();
  const [vig, cal] = await Promise.all([carregarConfigDaMeta(yearMonth), calendario()]);
  const faixas = faixasDe(vig);
  const where: Record<string, unknown> = { ...unitScopeWhere(user, 'unitId'), unit: { active: true }, ...(unitId ? { unitId } : {}) };
  const lista = await esperadosDoMes(where, yearMonth, vig, cal, agora);

  const esperados: EsperadoDaAuditoria[] = lista.map(({ r, prazoAte, situacao }) => ({
    id: r.id, unitId: r.unitId, unitName: r.unit.name, collaboratorId: r.collaboratorId, collaboratorName: r.collaborator.name,
    startDate: r.startDate, endDate: r.endDate, noticeAt: r.noticeAt.toISOString(), prazoAte: prazoAte.toISOString(),
    receivedByName: r.receivedByName, informedByName: r.informedByName, source: r.source, note: r.note,
    lancamento: r.certificate ? { id: r.certificate.id, lancadoEm: r.certificate.createdAt.toISOString(), lancadoPor: r.certificate.createdBy?.name ?? null, atraso: r.certificate.createdAt.getTime() > prazoAte.getTime() } : null,
    situacao,
    justification: r.justification, justifiedByName: r.justifiedByName, justifiedAt: r.justifiedAt?.toISOString() ?? null,
    reviewStatus: r.reviewStatus, reviewNote: r.reviewNote, reviewedByName: r.reviewedByName, reviewedAt: r.reviewedAt?.toISOString() ?? null,
    responsibleUserId: r.responsibleUserId, responsibleName: r.responsibleName, responsibilityValidatedAt: r.responsibilityValidatedAt?.toISOString() ?? null,
  }));

  const comPontos = (c: Conformidade) => { const comp = componenteDeAtestados(c, faixas); return { ...c, pontos: c.pct == null ? null : comp.scorePct, penalizacao: c.pct == null ? null : comp.penalizacao }; };
  const rede = comPontos(conformidade(esperados.map((e) => e.situacao)));

  const unidades = new Map<string, { unitId: string; unitName: string; situacoes: SituacaoDaAuditoria[] }>();
  for (const e of esperados) {
    const u = unidades.get(e.unitId) ?? { unitId: e.unitId, unitName: e.unitName, situacoes: [] };
    u.situacoes.push(e.situacao); unidades.set(e.unitId, u);
  }
  const porUnidade: LinhaPorUnidade[] = [...unidades.values()].map((u) => ({ unitId: u.unitId, unitName: u.unitName, ...comPontos(conformidade(u.situacoes)) }))
    .sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101) || a.unitName.localeCompare(b.unitName, 'pt-BR'));

  /* Responsabilidade individual: falhas só quando VALIDADAS (responsável atribuído pela supervisão); lançamentos pelo autor do atestado. */
  const unitIds = [...new Set(esperados.map((e) => e.unitId))];
  const gerentes = await prisma.user.findMany({
    where: { active: true, role: { in: ['MANAGER', 'COORDINATOR'] }, memberships: { some: { unitId: { in: unitIds.length ? unitIds : ['-'] } } } },
    select: { id: true, name: true, memberships: { select: { unitId: true, unit: { select: { name: true } } } } },
    orderBy: { name: 'asc' },
  });
  const gerentesPorUnidade: Record<string, { id: string; name: string }[]> = {};
  for (const g of gerentes) for (const m of g.memberships) (gerentesPorUnidade[m.unitId] ??= []).push({ id: g.id, name: g.name });
  const porGerenteMap = new Map<string, LinhaPorGerente>();
  const linha = (id: string, name: string) => { const l = porGerenteMap.get(id) ?? { userId: id, name, unidades: [], falhasConfirmadas: 0, lancamentos: 0, lancamentosNoPrazo: 0 }; porGerenteMap.set(id, l); return l; };
  for (const e of esperados) {
    if (e.situacao === 'FALHA_CONFIRMADA' && e.responsibleUserId && e.responsibilityValidatedAt) { const l = linha(e.responsibleUserId, e.responsibleName ?? '—'); l.falhasConfirmadas++; if (!l.unidades.includes(e.unitName)) l.unidades.push(e.unitName); }
  }
  for (const { r, prazoAte } of lista) {
    if (r.certificate?.createdBy) { const l = linha(r.certificate.createdBy.id, r.certificate.createdBy.name); l.lancamentos++; if (r.certificate.createdAt.getTime() <= prazoAte.getTime()) l.lancamentosNoPrazo++; if (!l.unidades.includes(r.unit.name)) l.unidades.push(r.unit.name); }
  }
  const porGerente = [...porGerenteMap.values()].sort((a, b) => b.falhasConfirmadas - a.falhasConfirmadas || b.lancamentos - a.lancamentos || a.name.localeCompare(b.name, 'pt-BR'));

  return { yearMonth, prazoHoras: vig.parametro(CHAVE_PRAZO_ATESTADOS), faixas, esperados, rede, porUnidade, porGerente, gerentesPorUnidade };
}

/**
 * O componente da META (v1.181.0): conformidade do mês da unidade → pontos da
 * faixa. Esperados em conferência ficam de fora; sem nada decidido = 0/0 =
 * neutro. `vig` é a configuração já carregada por `componentesDaMeta`.
 */
export async function getCertificatesCoverage(unitId: string, yearMonth: string, vig?: ConfigDaMeta): Promise<{ done: number; missed: number; scorePct?: number; pct: number | null; penalizacao: number }> {
  const v = vig ?? (await carregarConfigDaMeta(yearMonth));
  const cal = await calendario();
  const lista = await esperadosDoMes({ unitId }, yearMonth, v, cal, new Date());
  const c = conformidade(lista.map((x) => x.situacao));
  const comp = componenteDeAtestados(c, faixasDe(v));
  if (c.pct == null) return { done: 0, missed: 0, pct: null, penalizacao: 0 };
  return { done: comp.done, missed: comp.missed, scorePct: comp.scorePct, pct: c.pct, penalizacao: comp.penalizacao };
}
