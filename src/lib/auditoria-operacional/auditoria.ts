import { prisma } from '@/lib/db/prisma';
import { assertUnitAccess, canAccessUnit, unitScopeWhere, UnitScopeError } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyUnitRole, notifySupervisory, notifyUsers } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';
import type { OperationalReviewStatus } from '@prisma/client';
import { carregarConfigDaMeta, type ConfigDaMeta } from '@/lib/metas/vigencia';
import {
  componenteOperacional, conformidade, dataDoLancamento, dentroDaJanela, JANELA_DE_CRUZAMENTO_DIAS, limitesDoMes, moduloAuditado, MODULOS_AUDITADOS, MOTIVO_MIN,
  normalizarOrigem, normalizarReferencia, podeAuditar, podeConfirmarFalha, podeJustificar, prazoDeLancamento, REFERENCIA_MIN, situacaoDoEsperado, somarDiasIso, DATA_RE,
  type CalendarioUtil, type CatalogoDoModulo, type Conformidade, type ModuloAuditado, type OrigemDaInformacao, type SituacaoDaAuditoria,
} from './regras';

/**
 * AUDITORIA OPERACIONAL — leitura e gravação (v1.184.0). As regras vivem em
 * `regras.ts` (e nas dos atestados); aqui é banco, escopo, auditoria e avisos.
 *
 * Nada aqui altera as tabelas dos módulos (`received_notes`, `gas_receipts`,
 * `oil_collections`, `payment_requests`): o cruzamento só grava `entryId` no
 * esperado — sem FK de propósito, são quatro tabelas, e o esperado precisa
 * sobreviver a um lançamento excluído (a falha continua documentada).
 */

type Ctx = { ip?: string | null; userAgent?: string | null };
export type ResultadoDaAuditoria = { ok: true; id: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' | 'DUPLICATE' | 'ESTADO'; message?: string };

const LINK = (m: ModuloAuditado) => `/modulos/auditoria-operacional?modulo=${m.toLowerCase()}`;
const br = (iso: string) => iso.split('-').reverse().join('/');
const horaBR = (d: Date) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const dinheiro = (v: unknown) => `R$ ${Number(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Feriados cadastrados (Configurações → Feriados) como conjunto de dias. */
async function calendario(): Promise<CalendarioUtil> {
  const feriados = await prisma.holiday.findMany({ select: { date: true } });
  return { feriados: new Set(feriados.map((f) => f.date)), pulaDomingo: true };
}
function parametrosDe(vig: ConfigDaMeta, cat: CatalogoDoModulo): { prazoHoras: number; pctPorFalha: number } {
  return { prazoHoras: vig.parametro(cat.chavePrazo), pctPorFalha: vig.parametro(cat.chavePct) };
}

/* ───────────────────────── lançamentos dos módulos ───────────────────────── */

export interface LancamentoCandidato {
  id: string;
  unitId: string;
  /** Data do fato ('AAAA-MM-DD'): emissão/recebimento da nota, entrega do gás, coleta, dia do serviço. */
  data: string;
  descricao: string;
  lancadoEm: Date;
  lancadoPor: string | null;
}

const meioDia = (iso: string) => new Date(`${iso}T00:00:00Z`);
const fimDoDia = (iso: string) => new Date(`${iso}T23:59:59Z`);

/** Os lançamentos do módulo nas unidades, com a data do fato entre `de` e `ate` (inclusive). */
export async function lancamentosNoIntervalo(modulo: ModuloAuditado, unitIds: string[], de: string, ate: string): Promise<LancamentoCandidato[]> {
  if (unitIds.length === 0) return [];
  const faixa = { gte: meioDia(de), lte: fimDoDia(ate) };
  if (modulo === 'NOTES') {
    const rows = await prisma.receivedNote.findMany({
      where: { unitId: { in: unitIds }, OR: [{ issueDate: faixa }, { entryDate: faixa }, { createdAt: faixa }] },
      select: { id: true, unitId: true, supplierName: true, number: true, totalValue: true, issueDate: true, entryDate: true, createdAt: true, createdBy: { select: { name: true } } },
    });
    return rows.map((r) => ({ id: r.id, unitId: r.unitId, data: dataDoLancamento('NOTES', r), descricao: `${r.supplierName}${r.number ? ` · nº ${r.number}` : ''} · ${dinheiro(r.totalValue)}`, lancadoEm: r.createdAt, lancadoPor: r.createdBy?.name ?? null }));
  }
  if (modulo === 'GAS') {
    const rows = await prisma.gasReceipt.findMany({
      where: { unitId: { in: unitIds }, operationalDate: { gte: de, lte: ate } },
      select: { id: true, unitId: true, operationalDate: true, noteNumber: true, quantityKg: true, totalValue: true, createdAt: true, supplier: { select: { name: true } }, createdBy: { select: { name: true } } },
    });
    return rows.map((r) => ({ id: r.id, unitId: r.unitId, data: r.operationalDate, descricao: `${r.supplier?.name ?? 'sem fornecedor'}${r.noteNumber ? ` · nº ${r.noteNumber}` : ''} · ${Number(r.quantityKg)} kg · ${dinheiro(r.totalValue)}`, lancadoEm: r.createdAt, lancadoPor: r.createdBy?.name ?? null }));
  }
  if (modulo === 'OIL') {
    const rows = await prisma.oilCollection.findMany({
      where: { unitId: { in: unitIds }, operationalDate: { gte: de, lte: ate } },
      select: { id: true, unitId: true, operationalDate: true, liters: true, totalValue: true, collectorName: true, createdAt: true, supplier: { select: { name: true } }, createdBy: { select: { name: true } } },
    });
    return rows.map((r) => ({ id: r.id, unitId: r.unitId, data: r.operationalDate, descricao: `${r.collectorName ?? r.supplier?.name ?? 'coletora não informada'} · ${Number(r.liters)} L · ${dinheiro(r.totalValue)}`, lancadoEm: r.createdAt, lancadoPor: r.createdBy?.name ?? null }));
  }
  const TIPO: Record<string, string> = { FREELANCER: 'Freelancer', OVERTIME: 'Hora extra', MISC: 'Reembolso' };
  const rows = await prisma.paymentRequest.findMany({
    where: { unitId: { in: unitIds }, status: { not: 'REJECTED' }, OR: [{ workDate: faixa }, { entryDate: faixa }, { createdAt: faixa }] },
    select: { id: true, unitId: true, type: true, amount: true, workDate: true, entryDate: true, createdAt: true, collaboratorName: true, beneficiary: true, freelancer: { select: { name: true } }, requestedBy: { select: { name: true } } },
  });
  return rows.map((r) => ({ id: r.id, unitId: r.unitId, data: dataDoLancamento('PAYMENTS', r), descricao: `${TIPO[r.type] ?? r.type} · ${r.freelancer?.name ?? r.collaboratorName ?? r.beneficiary ?? '—'} · ${dinheiro(r.amount)}`, lancadoEm: r.createdAt, lancadoPor: r.requestedBy?.name ?? null }));
}

async function lancamentoPorId(modulo: ModuloAuditado, id: string): Promise<LancamentoCandidato | null> {
  const un = async (unitId: string | null, data: string, descricao: string, lancadoEm: Date, lancadoPor: string | null) => (unitId ? { id, unitId, data, descricao, lancadoEm, lancadoPor } : null);
  if (modulo === 'NOTES') {
    const r = await prisma.receivedNote.findUnique({ where: { id }, select: { unitId: true, supplierName: true, number: true, totalValue: true, issueDate: true, entryDate: true, createdAt: true, createdBy: { select: { name: true } } } });
    return r ? un(r.unitId, dataDoLancamento('NOTES', r), `${r.supplierName}${r.number ? ` · nº ${r.number}` : ''} · ${dinheiro(r.totalValue)}`, r.createdAt, r.createdBy?.name ?? null) : null;
  }
  if (modulo === 'GAS') {
    const r = await prisma.gasReceipt.findUnique({ where: { id }, select: { unitId: true, operationalDate: true, noteNumber: true, quantityKg: true, totalValue: true, createdAt: true, supplier: { select: { name: true } }, createdBy: { select: { name: true } } } });
    return r ? un(r.unitId, r.operationalDate, `${r.supplier?.name ?? 'sem fornecedor'}${r.noteNumber ? ` · nº ${r.noteNumber}` : ''} · ${Number(r.quantityKg)} kg · ${dinheiro(r.totalValue)}`, r.createdAt, r.createdBy?.name ?? null) : null;
  }
  if (modulo === 'OIL') {
    const r = await prisma.oilCollection.findUnique({ where: { id }, select: { unitId: true, operationalDate: true, liters: true, totalValue: true, collectorName: true, createdAt: true, supplier: { select: { name: true } }, createdBy: { select: { name: true } } } });
    return r ? un(r.unitId, r.operationalDate, `${r.collectorName ?? r.supplier?.name ?? 'coletora não informada'} · ${Number(r.liters)} L · ${dinheiro(r.totalValue)}`, r.createdAt, r.createdBy?.name ?? null) : null;
  }
  const r = await prisma.paymentRequest.findUnique({ where: { id }, select: { unitId: true, type: true, amount: true, workDate: true, entryDate: true, createdAt: true, collaboratorName: true, beneficiary: true, freelancer: { select: { name: true } }, requestedBy: { select: { name: true } } } });
  return r ? un(r.unitId, dataDoLancamento('PAYMENTS', r), `${r.type} · ${r.freelancer?.name ?? r.collaboratorName ?? r.beneficiary ?? '—'} · ${dinheiro(r.amount)}`, r.createdAt, r.requestedBy?.name ?? null) : null;
}

/** Ids de lançamentos do módulo já presos a um esperado (na unidade). */
async function idsJaVinculados(modulo: ModuloAuditado, unitIds: string[]): Promise<Set<string>> {
  const rows = await prisma.operationalExpectation.findMany({ where: { module: modulo, unitId: { in: unitIds }, entryId: { not: null } }, select: { entryId: true } });
  return new Set(rows.map((r) => r.entryId!));
}

/* ───────────────────────── cruzamento ───────────────────────── */

export type ResultadoDoCruzamento = 'VINCULADO' | 'AMBIGUO' | 'NENHUM';

async function vincular(expectationId: string, l: LancamentoCandidato): Promise<void> {
  await prisma.operationalExpectation.update({ where: { id: expectationId }, data: { entryId: l.id, entryAt: l.lancadoEm, entryByName: l.lancadoPor, linkedAt: new Date() } });
}

/** O esperado procura o lançamento: UM candidato na janela da data do fato → vincula; dois ou mais → fica para a mão. */
export async function cruzarOcorrencia(expectationId: string): Promise<ResultadoDoCruzamento> {
  const e = await prisma.operationalExpectation.findUnique({ where: { id: expectationId } });
  if (!e || e.entryId) return 'NENHUM';
  const presos = await idsJaVinculados(e.module, [e.unitId]);
  const candidatos = (await lancamentosNoIntervalo(e.module, [e.unitId], somarDiasIso(e.eventDate, -JANELA_DE_CRUZAMENTO_DIAS), somarDiasIso(e.eventDate, JANELA_DE_CRUZAMENTO_DIAS)))
    .filter((l) => !presos.has(l.id) && dentroDaJanela(l.data, e.eventDate));
  if (candidatos.length === 0) return 'NENHUM';
  if (candidatos.length > 1) return 'AMBIGUO';
  await vincular(e.id, candidatos[0]);
  return 'VINCULADO';
}

/**
 * Chamado pelos `create` dos quatro módulos: o lançamento recém-feito procura
 * o esperado ainda sem lançamento na mesma unidade e janela. Melhor esforço —
 * nunca derruba o lançamento.
 */
export async function cruzarLancamento(modulo: ModuloAuditado, entryId: string): Promise<ResultadoDoCruzamento> {
  const l = await lancamentoPorId(modulo, entryId);
  if (!l) return 'NENHUM';
  const jaPreso = await prisma.operationalExpectation.findFirst({ where: { module: modulo, entryId }, select: { id: true } });
  if (jaPreso) return 'NENHUM';
  const abertos = await prisma.operationalExpectation.findMany({
    where: { module: modulo, unitId: l.unitId, entryId: null, reviewStatus: { not: 'INVALIDO' }, eventDate: { gte: somarDiasIso(l.data, -JANELA_DE_CRUZAMENTO_DIAS), lte: somarDiasIso(l.data, JANELA_DE_CRUZAMENTO_DIAS) } },
    orderBy: { createdAt: 'asc' }, select: { id: true, eventDate: true },
  });
  const candidatos = abertos.filter((e) => dentroDaJanela(e.eventDate, l.data));
  if (candidatos.length === 0) return 'NENHUM';
  if (candidatos.length > 1) return 'AMBIGUO';
  await vincular(candidatos[0].id, l);
  return 'VINCULADO';
}

/* ───────────────────────── gravação ───────────────────────── */

export interface InformarOcorrenciaInput {
  modulo: string;
  unitId: string;
  reference: string;
  /** Data do fato ('AAAA-MM-DD'). */
  eventDate: string;
  /** ISO datetime da ciência do gerente. */
  noticeAt: string;
  source?: string;
  sourceDetail?: string;
  /** Quem deveria lançar (previsto) — gerente/coordenador da unidade; não é a responsabilidade validada. */
  expectedUserId?: string | null;
  note?: string;
}

async function gerenteDaUnidade(userId: string, unitId: string): Promise<{ id: string; name: string } | null> {
  return prisma.user.findFirst({ where: { id: userId, active: true, role: { in: ['MANAGER', 'COORDINATOR'] }, memberships: { some: { unitId } } }, select: { id: true, name: true } });
}

/** A supervisão informa a ocorrência que o gerente deveria ter lançado. */
export async function informarOcorrencia(user: SessionUser, input: InformarOcorrenciaInput, ctx: Ctx = {}): Promise<ResultadoDaAuditoria> {
  if (!podeAuditar(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const cat = moduloAuditado(input.modulo);
  if (!cat) return { ok: false, reason: 'INVALID', message: 'Módulo desconhecido.' };
  try { assertUnitAccess(user, input.unitId); } catch (e) { if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' }; throw e; }
  const reference = String(input.reference ?? '').trim();
  if (reference.length < REFERENCIA_MIN) return { ok: false, reason: 'INVALID', message: `Descreva a referência (${cat.referencia.toLowerCase()}).` };
  if (!DATA_RE.test(input.eventDate ?? '')) return { ok: false, reason: 'INVALID', message: 'Informe a data do fato.' };
  const noticeAt = new Date(input.noticeAt ?? '');
  if (Number.isNaN(noticeAt.getTime())) return { ok: false, reason: 'INVALID', message: 'Informe quando o gerente tomou ciência.' };
  if (noticeAt.getTime() > Date.now() + 60_000) return { ok: false, reason: 'INVALID', message: 'A ciência não pode estar no futuro.' };
  const source: OrigemDaInformacao = normalizarOrigem(input.source) ?? 'SUPERVISION';
  let esperado: { id: string; name: string } | null = null;
  if (input.expectedUserId) {
    esperado = await gerenteDaUnidade(input.expectedUserId, input.unitId);
    if (!esperado) return { ok: false, reason: 'INVALID', message: 'O responsável previsto precisa ser gerente ou coordenador desta unidade.' };
  }

  /* Duplicidade: mesma unidade, módulo, data do fato e referência (inválido não conta). */
  const iguais = await prisma.operationalExpectation.findMany({ where: { module: cat.key, unitId: input.unitId, eventDate: input.eventDate, reviewStatus: { not: 'INVALIDO' } }, select: { id: true, reference: true } });
  if (iguais.some((x) => normalizarReferencia(x.reference) === normalizarReferencia(reference))) return { ok: false, reason: 'DUPLICATE', message: `Já existe uma ocorrência de ${cat.rotulo} com esta referência em ${br(input.eventDate)}.` };

  const rec = await prisma.operationalExpectation.create({
    data: {
      module: cat.key, unitId: input.unitId, reference, eventDate: input.eventDate, noticeAt, source, sourceDetail: input.sourceDetail?.trim() || null,
      informedById: user.id, informedByName: user.name, expectedUserId: esperado?.id ?? null, expectedUserName: esperado?.name ?? null, note: input.note?.trim() || null,
    },
    select: { id: true },
  });
  const cruzou = await cruzarOcorrencia(rec.id);
  await audit({ userId: user.id, unitId: input.unitId, action: 'OPAUDIT_CREATE', module: cat.key, entity: 'operational_expectation', entityId: rec.id, metadata: { modulo: cat.key, reference, eventDate: input.eventDate, noticeAt: noticeAt.toISOString(), source, cruzou }, ...ctx });

  if (cruzou !== 'VINCULADO') {
    const [vig, cal] = await Promise.all([carregarConfigDaMeta(input.eventDate.slice(0, 7)), calendario()]);
    const prazo = prazoDeLancamento(noticeAt, parametrosDe(vig, cat).prazoHoras, cal);
    const payload = { title: `${cat.rotulo}: lançamento a fazer no SGO`, body: `${user.name} informou ${cat.rotulo.toLowerCase()} de ${br(input.eventDate)} (${reference}). Prazo para lançar: ${horaBR(prazo)}.`, link: LINK(cat.key), module: cat.key };
    await (esperado ? notifyUsers([esperado.id], payload) : notifyUnitRole(input.unitId, 'MANAGER', payload)).catch(() => {});
  }
  return { ok: true, id: rec.id };
}

/** A supervisão prende (ou troca) o lançamento de um esperado à mão — quando o cruzamento automático não decidiu. */
export async function vincularOcorrencia(user: SessionUser, id: string, entryId: string, ctx: Ctx = {}): Promise<ResultadoDaAuditoria> {
  if (!podeAuditar(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const e = await prisma.operationalExpectation.findUnique({ where: { id } });
  if (!e) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, e.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (e.reviewStatus === 'INVALIDO') return { ok: false, reason: 'ESTADO', message: 'Esperado inválido não recebe lançamento.' };
  const l = await lancamentoPorId(e.module, String(entryId ?? ''));
  if (!l || l.unitId !== e.unitId) return { ok: false, reason: 'NOT_FOUND', message: 'Lançamento não encontrado nesta unidade.' };
  const outro = await prisma.operationalExpectation.findFirst({ where: { module: e.module, entryId: l.id, NOT: { id } }, select: { id: true } });
  if (outro) return { ok: false, reason: 'DUPLICATE', message: 'Este lançamento já está preso a outra ocorrência.' };
  await vincular(e.id, l);
  await audit({ userId: user.id, unitId: e.unitId, action: 'OPAUDIT_LINK', module: e.module, entity: 'operational_expectation', entityId: id, metadata: { entryId: l.id, de: e.entryId }, ...ctx });
  return { ok: true, id };
}

/** Desfaz o vínculo (o esperado volta a procurar lançamento). */
export async function desvincularOcorrencia(user: SessionUser, id: string, ctx: Ctx = {}): Promise<ResultadoDaAuditoria> {
  if (!podeAuditar(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const e = await prisma.operationalExpectation.findUnique({ where: { id } });
  if (!e) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, e.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!e.entryId) return { ok: false, reason: 'ESTADO', message: 'Não há lançamento vinculado.' };
  await prisma.operationalExpectation.update({ where: { id }, data: { entryId: null, entryAt: null, entryByName: null, linkedAt: null } });
  await audit({ userId: user.id, unitId: e.unitId, action: 'OPAUDIT_UNLINK', module: e.module, entity: 'operational_expectation', entityId: id, metadata: { entryId: e.entryId }, ...ctx });
  return { ok: true, id };
}

/** O gerente (ou a supervisão) justifica o atraso/omissão. Só vale depois de aprovada. */
export async function justificarOcorrencia(user: SessionUser, id: string, texto: string, ctx: Ctx = {}): Promise<ResultadoDaAuditoria> {
  if (!podeJustificar(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const e = await prisma.operationalExpectation.findUnique({ where: { id } });
  if (!e) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, e.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (String(texto ?? '').trim().length < MOTIVO_MIN) return { ok: false, reason: 'INVALID', message: `A justificativa precisa de pelo menos ${MOTIVO_MIN} caracteres.` };
  if (e.reviewStatus === 'JUSTIFICADO' || e.reviewStatus === 'INVALIDO') return { ok: false, reason: 'ESTADO', message: 'Esta ocorrência já foi decidida pela supervisão.' };
  await prisma.operationalExpectation.update({ where: { id }, data: { justification: texto.trim(), justifiedById: user.id, justifiedByName: user.name, justifiedAt: new Date() } });
  await audit({ userId: user.id, unitId: e.unitId, action: 'OPAUDIT_JUSTIFY', module: e.module, entity: 'operational_expectation', entityId: id, metadata: { justificativa: texto.trim() }, ...ctx });
  const cat = moduloAuditado(e.module)!;
  await notifySupervisory({ title: `Justificativa para aprovar (${cat.rotulo})`, body: `${user.name} justificou o lançamento de ${cat.rotulo.toLowerCase()} de ${br(e.eventDate)} (${e.reference}). Aprove ou recuse na Auditoria operacional.`, link: LINK(e.module), module: e.module }, e.unitId).catch(() => {});
  return { ok: true, id };
}

export type DecisaoDaRevisao = 'FALHA' | 'JUSTIFICADO' | 'INVALIDO' | 'REABRIR';
export interface RevisarInput { decisao: DecisaoDaRevisao; nota?: string; responsibleUserId?: string | null }

/** A supervisão decide: confirma a falha (e atribui a responsabilidade), aceita a justificativa, invalida ou reabre. */
export async function revisarOcorrencia(user: SessionUser, id: string, input: RevisarInput, ctx: Ctx = {}): Promise<ResultadoDaAuditoria> {
  if (!podeAuditar(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const e = await prisma.operationalExpectation.findUnique({ where: { id } });
  if (!e) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, e.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const cat = moduloAuditado(e.module)!;
  const agora = new Date();
  const [vig, cal] = await Promise.all([carregarConfigDaMeta(e.eventDate.slice(0, 7)), calendario()]);
  const prazoAte = prazoDeLancamento(e.noticeAt, parametrosDe(vig, cat).prazoHoras, cal);
  const fatos = { reviewStatus: 'AGUARDANDO' as const, lancadoEm: e.entryAt, prazoAte };

  let data: Record<string, unknown> = { reviewNote: input.nota?.trim() || null, reviewedById: user.id, reviewedByName: user.name, reviewedAt: agora };
  if (input.decisao === 'FALHA') {
    if (!podeConfirmarFalha(fatos, agora)) return { ok: false, reason: 'ESTADO', message: 'Só dá para confirmar a falha com o prazo vencido e sem lançamento no prazo.' };
    let responsavel: { id: string; name: string } | null = null;
    if (input.responsibleUserId) {
      responsavel = await gerenteDaUnidade(input.responsibleUserId, e.unitId);
      if (!responsavel) return { ok: false, reason: 'INVALID', message: 'O responsável precisa ser gerente ou coordenador desta unidade.' };
    }
    data = { ...data, reviewStatus: 'FALHA_CONFIRMADA', responsibleUserId: responsavel?.id ?? null, responsibleName: responsavel?.name ?? null, responsibilityValidatedAt: responsavel ? agora : null };
  } else if (input.decisao === 'JUSTIFICADO') {
    if (!e.justification) return { ok: false, reason: 'ESTADO', message: 'Não há justificativa para aprovar.' };
    data = { ...data, reviewStatus: 'JUSTIFICADO' };
  } else if (input.decisao === 'INVALIDO') {
    if (String(input.nota ?? '').trim().length < MOTIVO_MIN) return { ok: false, reason: 'INVALID', message: `Diga por que a ocorrência não procede (mínimo ${MOTIVO_MIN} caracteres).` };
    data = { ...data, reviewStatus: 'INVALIDO' };
  } else if (input.decisao === 'REABRIR') {
    data = { ...data, reviewStatus: 'AGUARDANDO', responsibleUserId: null, responsibleName: null, responsibilityValidatedAt: null };
  } else {
    return { ok: false, reason: 'INVALID' };
  }
  await prisma.operationalExpectation.update({ where: { id }, data });
  await audit({ userId: user.id, unitId: e.unitId, action: 'OPAUDIT_REVIEW', module: e.module, entity: 'operational_expectation', entityId: id, metadata: { de: e.reviewStatus, decisao: input.decisao, nota: input.nota?.trim() || null, responsavel: (data.responsibleName as string | null) ?? null }, ...ctx });
  const aviso = input.decisao === 'FALHA' ? `Falha de lançamento confirmada (${cat.rotulo})` : input.decisao === 'JUSTIFICADO' ? `Justificativa aprovada (${cat.rotulo})` : input.decisao === 'INVALIDO' ? `Ocorrência invalidada (${cat.rotulo})` : `Auditoria reaberta (${cat.rotulo})`;
  const destinatarios = data.responsibleUserId ? [data.responsibleUserId as string] : null;
  const payload = { title: aviso, body: `${user.name} decidiu sobre ${cat.rotulo.toLowerCase()} de ${br(e.eventDate)} (${e.reference})${input.nota ? `: ${input.nota.trim()}` : '.'}`, link: LINK(e.module), module: e.module };
  await (destinatarios ? notifyUsers(destinatarios, payload) : notifyUnitRole(e.unitId, 'MANAGER', payload)).catch(() => {});
  return { ok: true, id };
}

/* ───────────────────────── leitura ───────────────────────── */

export interface OcorrenciaDaAuditoria {
  id: string;
  modulo: ModuloAuditado;
  unitId: string; unitName: string;
  reference: string;
  eventDate: string;
  noticeAt: string; prazoAte: string;
  source: OrigemDaInformacao; sourceDetail: string | null;
  informedByName: string; expectedUserName: string | null; note: string | null;
  /** O lançamento cruzado, se houver. */
  lancamento: { id: string; descricao: string | null; lancadoEm: string; lancadoPor: string | null; atraso: boolean } | null;
  /** Lançamentos do módulo na janela, ainda livres — para o vínculo manual (só quando não há lançamento). */
  candidatos: { id: string; data: string; descricao: string; lancadoEm: string; lancadoPor: string | null }[];
  situacao: SituacaoDaAuditoria;
  justification: string | null; justifiedByName: string | null; justifiedAt: string | null;
  reviewStatus: OperationalReviewStatus; reviewNote: string | null; reviewedByName: string | null; reviewedAt: string | null;
  responsibleUserId: string | null; responsibleName: string | null; responsibilityValidatedAt: string | null;
}
export interface LinhaPorUnidade extends Conformidade { unitId: string; unitName: string; pontos: number | null; penalizacao: number | null }
export interface LinhaPorGerente { userId: string; name: string; unidades: string[]; falhasConfirmadas: number; lancamentos: number; lancamentosNoPrazo: number }
export interface ResumoDoModulo extends Conformidade { modulo: ModuloAuditado; rotulo: string; prazoHoras: number; pctPorFalha: number; pontos: number | null; penalizacao: number | null }
export interface AuditoriaOperacional {
  yearMonth: string;
  modulo: ModuloAuditado;
  prazoHoras: number;
  pctPorFalha: number;
  /** Os quatro módulos, no mesmo recorte — para as abas e o quadro-resumo. */
  modulos: ResumoDoModulo[];
  ocorrencias: OcorrenciaDaAuditoria[];
  rede: Conformidade & { pontos: number | null; penalizacao: number | null };
  porUnidade: LinhaPorUnidade[];
  porGerente: LinhaPorGerente[];
  gerentesPorUnidade: Record<string, { id: string; name: string }[]>;
}

async function ocorrenciasDoMes(modulo: ModuloAuditado, where: Record<string, unknown>, yearMonth: string, prazoHoras: number, cal: CalendarioUtil, agora: Date) {
  const rows = await prisma.operationalExpectation.findMany({
    where: { ...where, module: modulo, eventDate: { startsWith: yearMonth } },
    orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
    include: { unit: { select: { name: true } } },
  });
  return rows.map((r) => {
    const prazoAte = prazoDeLancamento(r.noticeAt, prazoHoras, cal);
    const situacao = situacaoDoEsperado({ reviewStatus: r.reviewStatus, lancadoEm: r.entryAt, prazoAte }, agora);
    return { r, prazoAte, situacao };
  });
}

/** A auditoria do mês no escopo do usuário (filtro de unidade em AND), com o detalhe de UM módulo e o resumo dos quatro. */
export async function getAuditoriaOperacional(user: SessionUser, yearMonth: string, opts: { unitId?: string; modulo?: string } = {}): Promise<AuditoriaOperacional> {
  const agora = new Date();
  const cat = moduloAuditado(opts.modulo) ?? MODULOS_AUDITADOS[0];
  const [vig, cal] = await Promise.all([carregarConfigDaMeta(yearMonth), calendario()]);
  const where: Record<string, unknown> = { ...unitScopeWhere(user, 'unitId'), unit: { active: true }, ...(opts.unitId ? { unitId: opts.unitId } : {}) };

  const comPontos = (c: Conformidade, pct: number) => { const comp = componenteOperacional(c, pct); return { ...c, pontos: c.pct == null ? null : comp.scorePct, penalizacao: c.pct == null ? null : comp.penalizacao }; };

  /* Resumo dos quatro (aba a aba) — uma leitura por módulo. */
  const modulos: ResumoDoModulo[] = [];
  let listaDoModulo: Awaited<ReturnType<typeof ocorrenciasDoMes>> = [];
  for (const m of MODULOS_AUDITADOS) {
    const p = parametrosDe(vig, m);
    const lista = await ocorrenciasDoMes(m.key, where, yearMonth, p.prazoHoras, cal, agora);
    if (m.key === cat.key) listaDoModulo = lista;
    modulos.push({ modulo: m.key, rotulo: m.rotulo, prazoHoras: p.prazoHoras, pctPorFalha: p.pctPorFalha, ...comPontos(conformidade(lista.map((x) => x.situacao)), p.pctPorFalha) });
  }
  const { prazoHoras, pctPorFalha } = parametrosDe(vig, cat);

  /* Candidatos para os esperados sem lançamento: os lançamentos do módulo na janela do mês, uma consulta só. */
  const semLancamento = listaDoModulo.filter((x) => !x.r.entryId);
  const unitIds = [...new Set(listaDoModulo.map((x) => x.r.unitId))];
  let livres: LancamentoCandidato[] = [];
  if (semLancamento.length > 0) {
    const { inicio, fim } = limitesDoMes(yearMonth);
    const [todos, presos] = await Promise.all([lancamentosNoIntervalo(cat.key, unitIds, somarDiasIso(inicio, -JANELA_DE_CRUZAMENTO_DIAS), somarDiasIso(fim, JANELA_DE_CRUZAMENTO_DIAS)), idsJaVinculados(cat.key, unitIds)]);
    livres = todos.filter((l) => !presos.has(l.id));
  }
  /* Descrição do lançamento vinculado: lida na hora (o esperado só guarda o id). */
  const comLancamento = listaDoModulo.filter((x) => x.r.entryId);
  const descricoes = new Map<string, string>();
  if (comLancamento.length > 0) {
    const { inicio, fim } = limitesDoMes(yearMonth);
    for (const l of await lancamentosNoIntervalo(cat.key, unitIds, somarDiasIso(inicio, -45), somarDiasIso(fim, 45))) descricoes.set(l.id, l.descricao);
  }

  const ocorrencias: OcorrenciaDaAuditoria[] = listaDoModulo.map(({ r, prazoAte, situacao }) => ({
    id: r.id, modulo: r.module, unitId: r.unitId, unitName: r.unit.name, reference: r.reference, eventDate: r.eventDate,
    noticeAt: r.noticeAt.toISOString(), prazoAte: prazoAte.toISOString(), source: r.source, sourceDetail: r.sourceDetail,
    informedByName: r.informedByName, expectedUserName: r.expectedUserName, note: r.note,
    lancamento: r.entryId && r.entryAt ? { id: r.entryId, descricao: descricoes.get(r.entryId) ?? null, lancadoEm: r.entryAt.toISOString(), lancadoPor: r.entryByName, atraso: r.entryAt.getTime() > prazoAte.getTime() } : null,
    candidatos: r.entryId ? [] : livres.filter((l) => l.unitId === r.unitId && dentroDaJanela(l.data, r.eventDate)).map((l) => ({ id: l.id, data: l.data, descricao: l.descricao, lancadoEm: l.lancadoEm.toISOString(), lancadoPor: l.lancadoPor })),
    situacao,
    justification: r.justification, justifiedByName: r.justifiedByName, justifiedAt: r.justifiedAt?.toISOString() ?? null,
    reviewStatus: r.reviewStatus, reviewNote: r.reviewNote, reviewedByName: r.reviewedByName, reviewedAt: r.reviewedAt?.toISOString() ?? null,
    responsibleUserId: r.responsibleUserId, responsibleName: r.responsibleName, responsibilityValidatedAt: r.responsibilityValidatedAt?.toISOString() ?? null,
  }));

  const rede = comPontos(conformidade(ocorrencias.map((e) => e.situacao)), pctPorFalha);
  const unidades = new Map<string, { unitId: string; unitName: string; situacoes: SituacaoDaAuditoria[] }>();
  for (const e of ocorrencias) { const u = unidades.get(e.unitId) ?? { unitId: e.unitId, unitName: e.unitName, situacoes: [] }; u.situacoes.push(e.situacao); unidades.set(e.unitId, u); }
  const porUnidade: LinhaPorUnidade[] = [...unidades.values()].map((u) => ({ unitId: u.unitId, unitName: u.unitName, ...comPontos(conformidade(u.situacoes), pctPorFalha) }))
    .sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101) || a.unitName.localeCompare(b.unitName, 'pt-BR'));

  /* Responsabilidade individual: só falhas VALIDADAS; "lançou" = quem fez o lançamento cruzado. */
  const escopoIds = [...new Set([...unitIds, ...(opts.unitId ? [opts.unitId] : [])])];
  const gerentes = await prisma.user.findMany({
    where: { active: true, role: { in: ['MANAGER', 'COORDINATOR'] }, memberships: { some: { unitId: { in: escopoIds.length ? escopoIds : ['-'] } } } },
    select: { id: true, name: true, memberships: { select: { unitId: true } } }, orderBy: { name: 'asc' },
  });
  const gerentesPorUnidade: Record<string, { id: string; name: string }[]> = {};
  for (const g of gerentes) for (const m of g.memberships) (gerentesPorUnidade[m.unitId] ??= []).push({ id: g.id, name: g.name });
  const porGerenteMap = new Map<string, LinhaPorGerente>();
  const linha = (id: string, name: string) => { const l = porGerenteMap.get(id) ?? { userId: id, name, unidades: [], falhasConfirmadas: 0, lancamentos: 0, lancamentosNoPrazo: 0 }; porGerenteMap.set(id, l); return l; };
  for (const e of ocorrencias) {
    if (e.situacao === 'FALHA_CONFIRMADA' && e.responsibleUserId && e.responsibilityValidatedAt) { const l = linha(e.responsibleUserId, e.responsibleName ?? '—'); l.falhasConfirmadas++; if (!l.unidades.includes(e.unitName)) l.unidades.push(e.unitName); }
    if (e.lancamento?.lancadoPor) { const l = linha(`nome:${e.lancamento.lancadoPor}`, e.lancamento.lancadoPor); l.lancamentos++; if (!e.lancamento.atraso) l.lancamentosNoPrazo++; if (!l.unidades.includes(e.unitName)) l.unidades.push(e.unitName); }
  }
  const porGerente = [...porGerenteMap.values()].sort((a, b) => b.falhasConfirmadas - a.falhasConfirmadas || b.lancamentos - a.lancamentos || a.name.localeCompare(b.name, 'pt-BR'));

  return { yearMonth, modulo: cat.key, prazoHoras, pctPorFalha, modulos, ocorrencias, rede, porUnidade, porGerente, gerentesPorUnidade };
}

/**
 * O componente da META por módulo (v1.184.0): conformidade do mês da unidade →
 * 100 − (falhas × % por falha), limitado a 100%. Em conferência fica de fora;
 * nada decidido = 0/0 = neutro. `vig` é a configuração já carregada por
 * `componentesDaMeta`.
 */
export async function getOperationalAuditCoverage(modulo: ModuloAuditado, unitId: string, yearMonth: string, vig?: ConfigDaMeta): Promise<{ done: number; missed: number; scorePct?: number; pct: number | null; penalizacao: number }> {
  const cat = moduloAuditado(modulo)!;
  const v = vig ?? (await carregarConfigDaMeta(yearMonth));
  const { prazoHoras, pctPorFalha } = parametrosDe(v, cat);
  const cal = await calendario();
  const lista = await ocorrenciasDoMes(cat.key, { unitId }, yearMonth, prazoHoras, cal, new Date());
  const c = conformidade(lista.map((x) => x.situacao));
  const comp = componenteOperacional(c, pctPorFalha);
  if (c.pct == null) return { done: 0, missed: 0, pct: null, penalizacao: 0 };
  return { done: comp.done, missed: comp.missed, scorePct: comp.scorePct, pct: c.pct, penalizacao: comp.penalizacao };
}

/** Lançamentos da unidade já auditados (presos a um esperado), por módulo — o "Fora do prazo" os deixa de fora. */
export async function lancamentosAuditados(unitId: string): Promise<Record<ModuloAuditado, string[]>> {
  const rows = await prisma.operationalExpectation.findMany({ where: { unitId, entryId: { not: null } }, select: { module: true, entryId: true } });
  const out: Record<ModuloAuditado, string[]> = { NOTES: [], GAS: [], OIL: [], PAYMENTS: [] };
  for (const r of rows) out[r.module].push(r.entryId!);
  return out;
}
