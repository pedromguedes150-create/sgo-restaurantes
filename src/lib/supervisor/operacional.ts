import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { canAccessUnit, unitScopeWhere } from '@/lib/scope/unit-scope';
import { notifyUnitRole } from '@/lib/notifications';
import { faixaDaValidade, precisaTratativa } from '@/lib/stock/validade';
import { createOccurrence } from '@/lib/occurrences/create';
import { getUsageBoard } from '@/lib/supervisor/usage';
import {
  aderencia, contagemDirecionadas, direcionadaExigeTexto, GRAVIDADE_OCORRENCIA, montarAlertas, pctBR, montarRoteiro, principaisDesvios, reincidencias, respostaDerivada, situacaoDaAcao,
  type Alerta, type DadosPreVisita, type Gravidade, type ItemDoCatalogo, type Modo, type Resposta, type RespostaParaConta, type TipoUnidade,
} from '@/lib/supervisor/operacional-calculo';
import { ROTEIRO_PADRAO } from '@/lib/supervisor/operacional-catalogo';
import type { Prisma } from '@prisma/client';
import type { SessionUser } from '@/lib/auth/session';

/**
 * ACOMPANHAMENTO OPERACIONAL — servidor (v1.155.0). Composição: a pré-visita
 * só LÊ o que os módulos já gravam; a visita grava as próprias respostas e o
 * próprio plano de ação (lista da visita — decisão do Pedro). Nada aqui altera
 * checklist, estoque, desperdício, escala ou cofre: a conferência física só
 * alimenta a aderência operacional.
 */
type Ctx = { ip?: string | null; userAgent?: string | null };
export type ResultadoOp<T = object> =
  | ({ ok: true } & T)
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NAO_ENCONTRADO' | 'ENCERRADA' | 'TIPO'; detail?: string };

const hojeBR = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
const menosDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
const num = (v: unknown) => (v == null ? null : Number(v));
const JANELA = 7;

/** Quem conduz visita operacional (a matriz ainda filtra pela aba). */
const PODE_CONDUZIR = ['SUPERVISOR', 'COORDINATOR', 'ADMIN', 'CEO'];
export const podeConduzirVisita = (u: SessionUser) => PODE_CONDUZIR.includes(u.role);

/* ───────────────────────────── catálogo ───────────────────────────── */

export async function ensureDefaultAuditItems(): Promise<void> {
  const existentes = new Set((await prisma.visitAuditItem.findMany({ where: { seedKey: { not: null } }, select: { seedKey: true } })).map((x) => x.seedKey));
  const faltam = ROTEIRO_PADRAO.filter((i) => !existentes.has(i.key));
  if (!faltam.length) return;
  await prisma.visitAuditItem.createMany({
    data: faltam.map((i) => ({
      seedKey: i.key, section: i.secao, text: i.texto, order: ROTEIRO_PADRAO.indexOf(i) * 10, level: i.nivel, mode: i.modo ?? 'SIMPLES',
      unitTypes: i.tipos ?? [], requiresPizzeria: Boolean(i.pizzaria), photoOnNc: Boolean(i.fotoNc), noteOnNc: Boolean(i.obsNc),
    })),
    skipDuplicates: true,
  });
}

export async function listarCatalogo(): Promise<ItemDoCatalogo[]> {
  const itens = await prisma.visitAuditItem.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
  return itens.map((i) => ({
    id: i.id, section: i.section, text: i.text, order: i.order, level: i.level, mode: i.mode, unitTypes: i.unitTypes as TipoUnidade[],
    requiresPizzeria: i.requiresPizzeria, active: i.active, photoOnNc: i.photoOnNc, noteOnNc: i.noteOnNc, tempMin: num(i.tempMin), tempMax: num(i.tempMax),
  }));
}

export interface EntradaItem { section: string; text: string; order?: number; level: 'PRIMORDIAL' | 'COMPLEMENTAR'; mode: Modo; unitTypes: TipoUnidade[]; requiresPizzeria?: boolean; photoOnNc?: boolean; noteOnNc?: boolean; tempMin?: number | null; tempMax?: number | null; active?: boolean }

function validarItem(i: EntradaItem): boolean {
  if (!i.section?.trim() || !i.text?.trim()) return false;
  if (!['PRIMORDIAL', 'COMPLEMENTAR'].includes(i.level) || !['SIMPLES', 'AMOSTRAGEM', 'TEMPERATURA'].includes(i.mode)) return false;
  if (i.tempMin != null && i.tempMax != null && Number(i.tempMin) > Number(i.tempMax)) return false;
  return (i.unitTypes ?? []).every((t) => ['RESTAURANTE', 'LANCHONETE', 'CD', 'FABRICA'].includes(t));
}

export async function salvarItemDoCatalogo(user: SessionUser, id: string | null, i: EntradaItem, ctx: Ctx = {}): Promise<ResultadoOp<{ id: string }>> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  if (!validarItem(i)) return { ok: false, reason: 'INVALID' };
  const data = {
    section: i.section.trim(), text: i.text.trim(), order: Number(i.order ?? 0), level: i.level, mode: i.mode, unitTypes: i.unitTypes ?? [],
    requiresPizzeria: Boolean(i.requiresPizzeria), photoOnNc: Boolean(i.photoOnNc), noteOnNc: Boolean(i.noteOnNc),
    tempMin: i.mode === 'TEMPERATURA' && i.tempMin != null && `${i.tempMin}` !== '' ? Number(i.tempMin) : null,
    tempMax: i.mode === 'TEMPERATURA' && i.tempMax != null && `${i.tempMax}` !== '' ? Number(i.tempMax) : null,
    active: i.active ?? true,
  };
  const r = id ? await prisma.visitAuditItem.update({ where: { id }, data }) : await prisma.visitAuditItem.create({ data });
  await audit({ userId: user.id, action: id ? 'VISIT_AUDIT_ITEM_UPDATE' : 'VISIT_AUDIT_ITEM_CREATE', module: 'CONFIG', entity: 'visit_audit_item', entityId: r.id, metadata: { section: data.section, text: data.text, active: data.active }, ...ctx });
  return { ok: true, id: r.id };
}

/* ───────────────────────────── pré-visita ───────────────────────────── */

export async function coletarDadosPreVisita(unitId: string, hoje = hojeBR()): Promise<DadosPreVisita> {
  const unit = await prisma.unit.findUniqueOrThrow({ where: { id: unitId }, select: { operationType: true } });
  const de = menosDias(hoje, JANELA);
  const dias = Array.from({ length: JANELA }, (_, k) => menosDias(hoje, JANELA - k)); // d-7 … d-1
  const desde60 = menosDias(hoje, 60);
  const agora = new Date();

  const [wasteTpl, wasteRecent, snackRecent, tasks, falhas, occ, lots, seq, counts, divs, treinos, vault, colabs, acoes] = await Promise.all([
    prisma.taskTemplate.count({ where: { unitId, module: 'WASTE', active: true } }),
    prisma.wasteEntry.findMany({ where: { unitId, operationalDate: { gte: desde60, lt: hoje } }, select: { operationalDate: true } }),
    prisma.wasteSnackDiscard.findMany({ where: { unitId, operationalDate: { gte: desde60, lt: hoje } }, select: { operationalDate: true }, distinct: ['operationalDate'] }),
    prisma.taskInstance.groupBy({ by: ['status'], where: { unitId, operationalDate: { gte: de, lt: hoje } }, _count: { _all: true } }),
    prisma.taskItemResponse.groupBy({ by: ['itemText'], where: { status: 'NAO_REALIZADO', instance: { unitId, operationalDate: { gte: de, lt: hoje } } }, _count: { _all: true } }),
    prisma.occurrence.findMany({ where: { unitId, status: { in: ['OPEN', 'IN_PROGRESS'] } }, select: { createdAt: true, gravity: true, reviewDate: true } }),
    prisma.stockLot.findMany({ where: { unitId, status: 'OPEN' }, select: { status: true, expiresAt: true, lastReviewBand: true, qtyOnHand: true } }),
    prisma.commandSequence.count({ where: { unitId, active: true } }),
    prisma.commandCount.findMany({ where: { unitId, operationalDate: { gte: de, lt: hoje } }, select: { operationalDate: true } }),
    prisma.commandDivergence.count({ where: { unitId, status: 'OPEN' } }),
    prisma.trainingRecord.findMany({ where: { unitId, status: 'PENDING' }, select: { dueDate: true } }),
    prisma.cashVaultMovement.count({ where: { unitId, type: 'WITHDRAWAL', createdAt: { gte: new Date(Date.parse(`${menosDias(hoje, 30)}T00:00:00Z`)) } } }),
    prisma.collaborator.findMany({ where: { active: true, units: { some: { unitId } } }, select: { id: true, employeeSchedules: { where: { active: true }, select: { id: true }, take: 1 } } }),
    prisma.visitAction.findMany({ where: { unitId, status: { not: 'RESOLVIDO' } }, select: { status: true, dueDate: true } }),
  ]);
  const ids = colabs.map((c) => c.id);
  const [atestados, ferias, vaultExiste, lotesEver, treinosEver] = await Promise.all([
    ids.length ? prisma.medicalCertificate.count({ where: { collaboratorId: { in: ids }, type: { not: 'HOURS' }, startDate: { lte: hoje }, endDate: { gte: hoje } } }) : 0,
    ids.length ? prisma.vacation.count({ where: { collaboratorId: { in: ids }, status: { in: ['CONFIRMED', 'APPROVED', 'CHANGE_REQUESTED'] }, startDate: { lte: new Date(`${hoje}T23:59:59Z`) }, endDate: { gte: new Date(`${hoje}T00:00:00Z`) } } }) : 0,
    prisma.cashVault.count({ where: { unitId } }).catch(() => 0),
    prisma.stockLot.count({ where: { unitId } }),
    prisma.trainingRecord.count({ where: { unitId } }),
  ]);

  /* Desperdício: restaurante pela folha de kg; lanchonete pelos salgados. Só
     cobra quem tem a rotina (checklist WASTE ativo ou lançou nos últimos 60 dias). */
  const lanchonete = unit.operationType === 'LANCHONETE';
  const diasLancados = new Set((lanchonete ? snackRecent : wasteRecent).map((w) => w.operationalDate));
  const usaDesperdicio = !['CD'].includes(unit.operationType) && (wasteTpl > 0 || diasLancados.size > 0);
  const ultimo = [...diasLancados].sort().pop() ?? null;

  const porStatus = Object.fromEntries(tasks.map((t) => [t.status, t._count._all])) as Record<string, number>;
  const totalTarefas = Object.values(porStatus).reduce((s, n) => s + n, 0);

  return {
    desperdicio: usaDesperdicio ? { diasSemLancamento: dias.filter((d) => !diasLancados.has(d)).length, janela: JANELA, ultimoLancamento: ultimo } : null,
    checklists: totalTarefas ? {
      naoRealizados: porStatus.MISSED ?? 0, atrasados: porStatus.LATE ?? 0, realizados: porStatus.DONE ?? 0, janela: JANELA,
      itensComFalha: falhas.filter((f) => f._count._all >= 2).map((f) => ({ texto: f.itemText, vezes: f._count._all })).sort((a, b) => b.vezes - a.vezes),
    } : null,
    ocorrencias: {
      abertasHaMaisDe3Dias: occ.filter((o) => agora.getTime() - o.createdAt.getTime() > 3 * 86_400_000).length,
      criticasAbertas: occ.filter((o) => o.gravity === 'HIGH' || o.gravity === 'CRITICAL').length,
      revisaoVencida: occ.filter((o) => o.reviewDate && o.reviewDate < agora).length,
    },
    validade: lotesEver ? (() => {
      const comSaldo = lots.filter((l) => Number(l.qtyOnHand) > 0);
      const faixas = comSaldo.map((l) => faixaDaValidade(l.expiresAt, hoje));
      return {
        vencidos: faixas.filter((f) => f?.chave === 'VENCIDO').length,
        ate7Dias: faixas.filter((f) => f && f.chave !== 'VENCIDO' && f.dias <= 7).length,
        tratativasPendentes: comSaldo.filter((l) => precisaTratativa(l, hoje)).length,
      };
    })() : null,
    comandas: seq ? { diasSemContagem: dias.filter((d) => !counts.some((c) => c.operationalDate === d)).length, janela: JANELA, divergenciasAbertas: divs } : null,
    treinamentos: treinosEver ? { atrasados: treinos.filter((t) => t.dueDate < agora).length, pendentes: treinos.length } : null,
    cofre: vaultExiste ? { retiradasProibidas: vault, janela: 30 } : null,
    equipe: colabs.length ? { ativos: colabs.length, semEscala: colabs.filter((c) => c.employeeSchedules.length === 0).length, atestadosHoje: atestados, feriasHoje: ferias } : null,
    acoesAnteriores: acoes.length ? {
      vencidas: acoes.filter((a) => situacaoDaAcao(a, hoje) === 'VENCIDO').length,
      abertas: acoes.length,
      aguardandoValidacao: acoes.filter((a) => a.status === 'AGUARDANDO_VALIDACAO').length,
    } : null,
  };
}

async function unidadeNoAlcance(user: SessionUser, unitId: string) {
  if (!canAccessUnit(user, unitId)) return null;
  return prisma.unit.findFirst({ where: { id: unitId, active: true }, select: { id: true, name: true, operationType: true, hasPizzeria: true } });
}

/** Resumo pré-visita + pendências da visita anterior (para a tela de preparação). */
export async function getPreparacao(user: SessionUser, unitId: string) {
  const u = await unidadeNoAlcance(user, unitId);
  if (!u) return null;
  const alertas = montarAlertas(await coletarDadosPreVisita(unitId));
  return { unidade: u, alertas, pendencias: await pendenciasDaUnidade(unitId) };
}

export async function pendenciasDaUnidade(unitId: string, excetoVisitId?: string) {
  const hoje = hojeBR();
  const acoes = await prisma.visitAction.findMany({
    where: { unitId, status: { not: 'RESOLVIDO' }, ...(excetoVisitId ? { visitId: { not: excetoVisitId } } : {}) },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
  });
  return acoes.map((a) => ({ ...a, situacao: situacaoDaAcao(a, hoje) }));
}

/* ───────────────────────────── visita ───────────────────────────── */

/**
 * Inicia a visita operacional: converte uma visita PLANEJADA (ou cria uma para
 * hoje), congela os alertas e cria o roteiro A/B/C. Idempotente: visita já
 * iniciada só devolve o id.
 */
export async function iniciarVisita(user: SessionUser, input: { visitId?: string; unitId?: string }, ctx: Ctx = {}): Promise<ResultadoOp<{ id: string }>> {
  if (!podeConduzirVisita(user)) return { ok: false, reason: 'FORBIDDEN' };
  let visita = input.visitId ? await prisma.supervisorVisit.findUnique({ where: { id: input.visitId } }) : null;
  const unitId = visita?.unitId ?? input.unitId;
  if (!unitId) return { ok: false, reason: 'INVALID' };
  const u = await unidadeNoAlcance(user, unitId);
  if (!u) return { ok: false, reason: 'FORBIDDEN' };
  if (visita && visita.status !== 'PLANNED') return { ok: false, reason: 'ENCERRADA' };
  if (visita?.kind === 'OPERACIONAL' && visita.startedAt) return { ok: true, id: visita.id };

  await ensureDefaultAuditItems();
  const [dados, catalogo] = await Promise.all([coletarDadosPreVisita(unitId), listarCatalogo()]);
  const alertas = montarAlertas(dados);
  const roteiro = montarRoteiro(catalogo, { operationType: u.operationType as TipoUnidade, hasPizzeria: u.hasPizzeria }, alertas);

  visita = await prisma.$transaction(async (tx) => {
    const v = visita
      ? await tx.supervisorVisit.update({ where: { id: visita.id }, data: { kind: 'OPERACIONAL', startedAt: new Date(), preVisitSnapshot: alertas as unknown as Prisma.InputJsonValue, supervisorId: user.id, supervisorName: user.name } })
      : await tx.supervisorVisit.create({ data: { unitId, supervisorId: user.id, supervisorName: user.name, scheduledDate: hojeBR(), kind: 'OPERACIONAL', startedAt: new Date(), preVisitSnapshot: alertas as unknown as Prisma.InputJsonValue } });
    await tx.visitAuditResponse.createMany({
      data: roteiro.map((r) => ({ visitId: v.id, itemKey: r.itemKey, itemId: r.itemId, section: r.section, text: r.text, level: r.level, mode: r.mode, tempMin: r.tempMin, tempMax: r.tempMax, photoOnNc: r.photoOnNc, noteOnNc: r.noteOnNc, order: r.order })),
      skipDuplicates: true,
    });
    return v;
  });
  await audit({ userId: user.id, unitId, action: 'VISIT_OP_START', module: 'SUPERVISION', entity: 'supervisor_visit', entityId: visita.id, metadata: { itens: roteiro.length, alertas: alertas.filter((a) => a.nivel !== 'ok').length }, ...ctx });
  return { ok: true, id: visita.id };
}

async function visitaEmAndamento(user: SessionUser, visitId: string) {
  const v = await prisma.supervisorVisit.findUnique({ where: { id: visitId } });
  if (!v || v.kind !== 'OPERACIONAL') return { erro: 'NAO_ENCONTRADO' as const };
  if (!canAccessUnit(user, v.unitId) || !podeConduzirVisita(user)) return { erro: 'FORBIDDEN' as const };
  if (v.status !== 'PLANNED') return { erro: 'ENCERRADA' as const };
  return { v };
}

export interface EntradaResposta {
  responseId: string; answer?: Resposta | null; note?: string | null; gravity?: Gravidade | null;
  sampleChecked?: number | null; sampleOk?: number | null; temperature?: number | null; photoPath?: string | null; removerFoto?: string | null;
}

export async function responderItem(user: SessionUser, e: EntradaResposta, ctx: Ctx = {}): Promise<ResultadoOp<{ answer: Resposta | null }>> {
  const r = await prisma.visitAuditResponse.findUnique({ where: { id: e.responseId } });
  if (!r) return { ok: false, reason: 'NAO_ENCONTRADO' };
  const x = await visitaEmAndamento(user, r.visitId);
  if ('erro' in x) return { ok: false, reason: x.erro! };
  const sc = e.sampleChecked == null || `${e.sampleChecked}` === '' ? null : Math.max(0, Math.floor(Number(e.sampleChecked)));
  const so = e.sampleOk == null || `${e.sampleOk}` === '' ? null : Math.max(0, Math.floor(Number(e.sampleOk)));
  if (sc != null && so != null && so > sc) return { ok: false, reason: 'INVALID', detail: 'Conformes não pode ser maior que conferidos.' };
  const temp = e.temperature == null || `${e.temperature}` === '' ? null : Number(e.temperature);
  if (temp != null && !Number.isFinite(temp)) return { ok: false, reason: 'INVALID' };
  const answer = respostaDerivada({ mode: r.mode, answer: e.answer ?? null, sampleChecked: sc, sampleOk: so, temperature: temp, tempMin: num(r.tempMin), tempMax: num(r.tempMax) });
  /* Direcionada (v1.155.1): "Requer ação" pede observação e "Não se aplica" pede
     justificativa; "Verificado" só registra a validação. */
  if (r.level === 'DIRECIONADA' && direcionadaExigeTexto(answer) && !e.note?.trim()) {
    return { ok: false, reason: 'INVALID', detail: answer === 'NAO_SE_APLICA' ? 'Escreva a justificativa: por que o dado não corresponde à unidade.' : 'Escreva a observação: qual é a situação atual que requer ação.' };
  }
  const fotos = Array.isArray(r.photos) ? (r.photos as string[]) : [];
  const novasFotos = [...fotos.filter((f) => f !== e.removerFoto), ...(e.photoPath ? [e.photoPath] : [])];
  await prisma.visitAuditResponse.update({
    where: { id: r.id },
    data: {
      answer, note: e.note?.trim() || null, gravity: answer === 'NAO_CONFORME' ? (e.gravity ?? 'MEDIA') : null,
      sampleChecked: sc, sampleOk: so, temperature: temp, photos: novasFotos as unknown as Prisma.InputJsonValue,
      answeredById: user.id, answeredByName: user.name, answeredAt: new Date(),
    },
  });
  await audit({ userId: user.id, unitId: x.v.unitId, action: 'VISIT_OP_ANSWER', module: 'SUPERVISION', entity: 'visit_audit_response', entityId: r.id, metadata: { item: r.text, antes: r.answer, depois: answer, foto: Boolean(e.photoPath) }, ...ctx });
  return { ok: true, answer };
}

export interface EntradaAcao { visitId: string; responseId?: string | null; problem: string; category?: string | null; responsibleName?: string | null; dueDate?: string | null; gravity?: Gravidade | null; note?: string | null; photoPath?: string | null }

export async function criarAcao(user: SessionUser, e: EntradaAcao, ctx: Ctx = {}): Promise<ResultadoOp<{ id: string }>> {
  const x = await visitaEmAndamento(user, e.visitId);
  if ('erro' in x) return { ok: false, reason: x.erro! };
  if (!e.problem?.trim()) return { ok: false, reason: 'INVALID', detail: 'Descreva o problema.' };
  if (e.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(e.dueDate)) return { ok: false, reason: 'INVALID', detail: 'Prazo inválido.' };
  const resp = e.responseId ? await prisma.visitAuditResponse.findFirst({ where: { id: e.responseId, visitId: e.visitId } }) : null;
  const a = await prisma.visitAction.create({
    data: {
      visitId: e.visitId, responseId: resp?.id ?? null, unitId: x.v.unitId, problem: e.problem.trim(), category: e.category?.trim() || resp?.section || 'Geral',
      responsibleName: e.responsibleName?.trim() || null, dueDate: e.dueDate || null, gravity: e.gravity ?? resp?.gravity ?? 'MEDIA',
      note: e.note?.trim() || null, photoPath: e.photoPath ?? (Array.isArray(resp?.photos) ? ((resp!.photos as string[])[0] ?? null) : null),
      createdById: user.id, createdByName: user.name,
    },
  });
  await audit({ userId: user.id, unitId: x.v.unitId, action: 'VISIT_ACTION_CREATE', module: 'SUPERVISION', entity: 'visit_action', entityId: a.id, metadata: { problema: a.problem, prazo: a.dueDate, responsavel: a.responsibleName, gravidade: a.gravity }, ...ctx });
  return { ok: true, id: a.id };
}

/** Não conformidade de manutenção/estrutura → ocorrência EXISTENTE (sem sistema paralelo), vinculada à ação. */
export async function gerarOcorrencia(user: SessionUser, e: { responseId: string; typeId: string; categoryId?: string | null }, ctx: Ctx = {}): Promise<ResultadoOp<{ number: number }>> {
  const r = await prisma.visitAuditResponse.findUnique({ where: { id: e.responseId } });
  if (!r) return { ok: false, reason: 'NAO_ENCONTRADO' };
  const x = await visitaEmAndamento(user, r.visitId);
  if ('erro' in x) return { ok: false, reason: x.erro! };
  if (r.answer !== 'NAO_CONFORME') return { ok: false, reason: 'INVALID', detail: 'Só item não conforme gera ocorrência.' };
  const g = (r.gravity ?? 'MEDIA') as Gravidade;
  const oc = await createOccurrence(user, {
    unitId: x.v.unitId, typeId: e.typeId, categoryId: e.categoryId ?? undefined, gravity: GRAVIDADE_OCORRENCIA[g],
    description: `Visita operacional ${x.v.scheduledDate.split('-').reverse().join('/')} — ${r.section}: ${r.text.replace(/^Conferir no local: /, '')}${r.note ? `. Obs.: ${r.note}` : ''}`,
  }, ctx);
  if (!oc.ok) return { ok: false, reason: oc.reason === 'FORBIDDEN' ? 'FORBIDDEN' : 'INVALID' };
  const acao = await prisma.visitAction.findFirst({ where: { responseId: r.id } });
  if (acao) await prisma.visitAction.update({ where: { id: acao.id }, data: { occurrenceId: oc.id } });
  else await prisma.visitAction.create({ data: { visitId: r.visitId, responseId: r.id, unitId: x.v.unitId, problem: r.text.replace(/^Conferir no local: /, ''), category: r.section, gravity: g, note: r.note, occurrenceId: oc.id, createdById: user.id, createdByName: user.name } });
  await audit({ userId: user.id, unitId: x.v.unitId, action: 'VISIT_OP_OCCURRENCE', module: 'SUPERVISION', entity: 'visit_audit_response', entityId: r.id, metadata: { ocorrencia: oc.number }, ...ctx });
  return { ok: true, number: oc.number };
}

/** Validação PRESENCIAL de uma pendência de visita anterior. */
export async function validarAcao(user: SessionUser, e: { actionId: string; visitId: string; resolvido: boolean; nota?: string | null }, ctx: Ctx = {}): Promise<ResultadoOp> {
  const x = await visitaEmAndamento(user, e.visitId);
  if ('erro' in x) return { ok: false, reason: x.erro! };
  const a = await prisma.visitAction.findUnique({ where: { id: e.actionId } });
  if (!a || a.unitId !== x.v.unitId) return { ok: false, reason: 'NAO_ENCONTRADO' };
  if (a.status === 'RESOLVIDO') return { ok: false, reason: 'ENCERRADA' };
  await prisma.visitAction.update({
    where: { id: a.id },
    data: e.resolvido
      ? { status: 'RESOLVIDO', validatedById: user.id, validatedByName: user.name, validatedAt: new Date(), validatedVisitId: e.visitId, unitNote: e.nota?.trim() || a.unitNote }
      : { status: 'ABERTO', rejectedCount: { increment: 1 }, validatedVisitId: e.visitId, note: e.nota?.trim() ? `${a.note ? `${a.note} · ` : ''}Visita ${x.v.scheduledDate}: ${e.nota.trim()}` : a.note },
  });
  await audit({ userId: user.id, unitId: a.unitId, action: e.resolvido ? 'VISIT_ACTION_VALIDATED' : 'VISIT_ACTION_REJECTED', module: 'SUPERVISION', entity: 'visit_action', entityId: a.id, metadata: { problema: a.problem, visita: e.visitId, nota: e.nota ?? null }, ...ctx });
  return { ok: true };
}

/** A UNIDADE atualiza a própria ação (não valida — quem valida é o supervisor). */
export async function atualizarAcaoPelaUnidade(user: SessionUser, e: { actionId: string; status: 'EM_ANDAMENTO' | 'AGUARDANDO_VALIDACAO'; nota?: string | null }, ctx: Ctx = {}): Promise<ResultadoOp> {
  if (!['EM_ANDAMENTO', 'AGUARDANDO_VALIDACAO'].includes(e.status)) return { ok: false, reason: 'INVALID' };
  const a = await prisma.visitAction.findUnique({ where: { id: e.actionId } });
  if (!a) return { ok: false, reason: 'NAO_ENCONTRADO' };
  if (!canAccessUnit(user, a.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (a.status === 'RESOLVIDO') return { ok: false, reason: 'ENCERRADA' };
  await prisma.visitAction.update({ where: { id: a.id }, data: { status: e.status, unitNote: e.nota?.trim() || a.unitNote, unitUpdatedBy: user.name, unitUpdatedAt: new Date() } });
  await audit({ userId: user.id, unitId: a.unitId, action: 'VISIT_ACTION_UNIT_UPDATE', module: 'SUPERVISION', entity: 'visit_action', entityId: a.id, metadata: { de: a.status, para: e.status, nota: e.nota ?? null }, ...ctx });
  return { ok: true };
}

export interface ResumoDaVisita {
  aderencia: ReturnType<typeof aderencia>;
  /** Itens direcionados pelos dados do SGO (v1.155.1). Resultados antigos não têm. */
  dadosSgo?: ReturnType<typeof contagemDirecionadas>;
  desvios: { secao: string; qtd: number }[];
  reincidencias: number;
  pendenciasAnteriores: { verificadas: number; resolvidas: number; permanecem: number };
  acoes: { abertas: number; criticas: number };
  alertas: number;
}

async function montarResumo(visitId: string, unitId: string): Promise<ResumoDaVisita> {
  const [rs, acoes, anteriores, validadas] = await Promise.all([
    prisma.visitAuditResponse.findMany({ where: { visitId } }),
    prisma.visitAction.findMany({ where: { visitId }, select: { status: true, gravity: true } }),
    prisma.visitAuditResponse.findMany({ where: { visit: { unitId, status: 'DONE', kind: 'OPERACIONAL', id: { not: visitId } }, answer: 'NAO_CONFORME', itemId: { not: null } }, select: { itemId: true } }),
    prisma.visitAction.findMany({ where: { validatedVisitId: visitId }, select: { status: true } }),
  ]);
  const conta: RespostaParaConta[] = rs.map((r) => ({ itemKey: r.itemKey, itemId: r.itemId, section: r.section, level: r.level, mode: r.mode, answer: r.answer, gravity: r.gravity, sampleChecked: r.sampleChecked, sampleOk: r.sampleOk }));
  const visita = await prisma.supervisorVisit.findUnique({ where: { id: visitId }, select: { preVisitSnapshot: true } });
  const alertas = Array.isArray(visita?.preVisitSnapshot) ? (visita!.preVisitSnapshot as unknown as Alerta[]).filter((a) => a.nivel !== 'ok').length : 0;
  return {
    aderencia: aderencia(conta),
    dadosSgo: contagemDirecionadas(conta),
    desvios: principaisDesvios(conta),
    reincidencias: reincidencias(conta, new Set(anteriores.map((a) => a.itemId as string))).length,
    pendenciasAnteriores: { verificadas: validadas.length, resolvidas: validadas.filter((v) => v.status === 'RESOLVIDO').length, permanecem: validadas.filter((v) => v.status !== 'RESOLVIDO').length },
    acoes: { abertas: acoes.filter((a) => a.status !== 'RESOLVIDO').length, criticas: acoes.filter((a) => a.gravity === 'CRITICA').length },
    alertas,
  };
}

/** Finaliza: congela o resultado, conclui a visita e avisa o gerente. */
export async function finalizarVisita(user: SessionUser, e: { visitId: string; comentario?: string | null }, ctx: Ctx = {}): Promise<ResultadoOp<{ resumo: ResumoDaVisita }>> {
  const x = await visitaEmAndamento(user, e.visitId);
  if ('erro' in x) return { ok: false, reason: x.erro! };
  const resumo = await montarResumo(e.visitId, x.v.unitId);
  if (resumo.aderencia.respondidos === 0) return { ok: false, reason: 'INVALID', detail: 'Responda pelo menos um item antes de finalizar.' };
  const pct = resumo.aderencia.pct;
  const feedback = e.comentario?.trim() || `Acompanhamento operacional: aderência ${pctBR(pct)} · ${resumo.aderencia.naoConformes} não conformidade(s) · ${resumo.acoes.abertas} ação(ões) abertas.`;
  await prisma.supervisorVisit.update({ where: { id: e.visitId }, data: { status: 'DONE', doneAt: new Date(), feedback, summary: resumo as unknown as Prisma.InputJsonValue } });
  await prisma.supervisorVisitPlan.updateMany({ where: { unitId: x.v.unitId, active: true }, data: { lastVisitAt: new Date() } }).catch(() => {});
  await audit({ userId: user.id, unitId: x.v.unitId, action: 'VISIT_OP_DONE', module: 'SUPERVISION', entity: 'supervisor_visit', entityId: e.visitId, metadata: { aderencia: pct, naoConformes: resumo.aderencia.naoConformes, criticos: resumo.aderencia.criticos, acoes: resumo.acoes.abertas }, ...ctx });
  await notifyUnitRole(x.v.unitId, 'MANAGER', {
    title: 'Visita operacional concluída',
    body: `${user.name}: aderência ${pctBR(pct)}, ${resumo.aderencia.naoConformes} não conformidade(s), ${resumo.acoes.abertas} ação(ões) no plano.`,
    link: '/modulos/plano-de-acao', module: 'SUPERVISION',
  }).catch(() => {});
  return { ok: true, resumo };
}

/** Tudo da visita para a tela (execução ou resultado). */
export async function getVisitaOperacional(user: SessionUser, visitId: string) {
  const v = await prisma.supervisorVisit.findUnique({ where: { id: visitId }, include: { responses: { orderBy: { order: 'asc' } }, actions: { orderBy: { createdAt: 'asc' } } } });
  if (!v || v.kind !== 'OPERACIONAL' || !canAccessUnit(user, v.unitId)) return null;
  const unidade = await prisma.unit.findUnique({ where: { id: v.unitId }, select: { id: true, name: true, operationType: true, hasPizzeria: true } });
  const hoje = hojeBR();
  return {
    visita: { id: v.id, unitId: v.unitId, data: v.scheduledDate, status: v.status, supervisor: v.supervisorName, iniciadaEm: v.startedAt?.toISOString() ?? null, concluidaEm: v.doneAt?.toISOString() ?? null, feedback: v.feedback },
    unidade,
    alertas: (Array.isArray(v.preVisitSnapshot) ? v.preVisitSnapshot : []) as unknown as Alerta[],
    respostas: v.responses.map((r) => ({ ...r, tempMin: num(r.tempMin), tempMax: num(r.tempMax), temperature: num(r.temperature), photos: Array.isArray(r.photos) ? (r.photos as string[]) : [] })),
    acoes: v.actions.map((a) => ({ ...a, situacao: situacaoDaAcao(a, hoje) })),
    pendencias: v.status === 'PLANNED' ? await pendenciasDaUnidade(v.unitId, v.id) : (await prisma.visitAction.findMany({ where: { validatedVisitId: v.id } })).map((a) => ({ ...a, situacao: situacaoDaAcao(a, hoje) })),
    resumo: (v.summary as unknown as ResumoDaVisita | null) ?? (await montarResumo(v.id, v.unitId)),
  };
}

/* ───────────────────────────── indicadores ───────────────────────────── */

const ymMenos = (ym: string, k: number) => { const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 - k, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };

export interface LinhaUnidadeOp {
  unitId: string; nome: string; operationType: string; usoPct: number | null;
  visitas: number; aderencia: number | null; naoConformes: number; criticos: number; reincidencias: number;
  acoesAbertas: number; acoesVencidas: number; ultimaVisita: string | null; proximaVisita: string | null;
}

/** Visitas operacionais concluídas no mês, por unidade do alcance. */
async function agregadoDoMes(unitIds: string[], ym: string) {
  const visitas = await prisma.supervisorVisit.findMany({
    where: { unitId: { in: unitIds }, kind: 'OPERACIONAL', status: 'DONE', scheduledDate: { gte: `${ym}-01`, lt: `${ymMenos(ym, -1)}-01` } },
    select: { id: true, unitId: true, summary: true },
  });
  const ids = visitas.map((v) => v.id);
  const respostas = ids.length ? await prisma.visitAuditResponse.findMany({ where: { visitId: { in: ids }, answer: 'NAO_CONFORME' }, select: { visitId: true, section: true, answer: true, level: true } }) : [];
  return { visitas, respostas };
}

export async function getIndicadoresOperacionais(user: SessionUser, ym: string) {
  const unidades = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true, operationType: true } });
  const ids = unidades.map((u) => u.id);
  const hoje = hojeBR();
  const ant = ymMenos(ym, 1);
  const [atual, anterior, uso, acoes, ultimas, proximas] = await Promise.all([
    agregadoDoMes(ids, ym), agregadoDoMes(ids, ant),
    getUsageBoard(user, ym).catch(() => []),
    prisma.visitAction.findMany({ where: { unitId: { in: ids } }, select: { unitId: true, status: true, dueDate: true, gravity: true, rejectedCount: true } }),
    prisma.supervisorVisit.groupBy({ by: ['unitId'], where: { unitId: { in: ids }, status: 'DONE' }, _max: { scheduledDate: true } }),
    prisma.supervisorVisit.groupBy({ by: ['unitId'], where: { unitId: { in: ids }, status: 'PLANNED', scheduledDate: { gte: hoje } }, _min: { scheduledDate: true } }),
  ]);
  const usoPor = new Map(uso.map((u: { unitId: string; usagePct: number }) => [u.unitId, u.usagePct]));
  const resumoDe = (v: { summary: unknown }) => v.summary as ResumoDaVisita | null;
  const media = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? Math.round((v.reduce((s, n) => s + n, 0) / v.length) * 10) / 10 : null; };

  const linhas: LinhaUnidadeOp[] = unidades.map((u) => {
    const vs = atual.visitas.filter((v) => v.unitId === u.id);
    const rs = vs.map(resumoDe).filter(Boolean) as ResumoDaVisita[];
    const ac = acoes.filter((a) => a.unitId === u.id && a.status !== 'RESOLVIDO');
    return {
      unitId: u.id, nome: u.name, operationType: u.operationType, usoPct: usoPor.get(u.id) ?? null,
      visitas: vs.length, aderencia: media(rs.map((r) => r.aderencia.pct)),
      naoConformes: rs.reduce((s, r) => s + r.aderencia.naoConformes, 0), criticos: rs.reduce((s, r) => s + r.aderencia.criticos, 0),
      reincidencias: rs.reduce((s, r) => s + r.reincidencias, 0),
      acoesAbertas: ac.length, acoesVencidas: ac.filter((a) => situacaoDaAcao(a, hoje) === 'VENCIDO').length,
      ultimaVisita: ultimas.find((x) => x.unitId === u.id)?._max.scheduledDate ?? null,
      proximaVisita: proximas.find((x) => x.unitId === u.id)?._min.scheduledDate ?? null,
    };
  });
  const redeDe = (ag: Awaited<ReturnType<typeof agregadoDoMes>>) => {
    const rs = ag.visitas.map(resumoDe).filter(Boolean) as ResumoDaVisita[];
    return { visitas: ag.visitas.length, aderencia: media(rs.map((r) => r.aderencia.pct)), naoConformes: rs.reduce((s, r) => s + r.aderencia.naoConformes, 0), criticos: rs.reduce((s, r) => s + r.aderencia.criticos, 0), reincidencias: rs.reduce((s, r) => s + r.reincidencias, 0), unidadesVisitadas: new Set(ag.visitas.map((v) => v.unitId)).size };
  };
  const resolvidas = acoes.filter((a) => a.status === 'RESOLVIDO').length;
  return {
    ym, anterior: ant, linhas,
    rede: {
      atual: redeDe(atual), anteriorMes: redeDe(anterior),
      unidades: unidades.length,
      semVisita: linhas.filter((l) => l.visitas === 0).length,
      acoesAbertas: acoes.filter((a) => a.status !== 'RESOLVIDO').length,
      acoesVencidas: acoes.filter((a) => a.status !== 'RESOLVIDO' && situacaoDaAcao(a, hoje) === 'VENCIDO').length,
      /** null = nenhuma ação ainda (ausência não é 0%). */
      taxaResolucao: acoes.length ? Math.round((resolvidas / acoes.length) * 1000) / 10 : null,
    },
    desvios: principaisDesvios(atual.respostas, 8),
  };
}

/** Visão da unidade: uso × aderência, visitas, pendências e evolução de 6 meses. */
export async function getVisaoDaUnidade(user: SessionUser, unitId: string) {
  const u = await unidadeNoAlcance(user, unitId);
  if (!u) return null;
  const hoje = hojeBR();
  const ym = hoje.slice(0, 7);
  const meses = Array.from({ length: 6 }, (_, k) => ymMenos(ym, 5 - k));
  const [visitas, acoes, usos] = await Promise.all([
    prisma.supervisorVisit.findMany({ where: { unitId }, orderBy: { scheduledDate: 'desc' }, take: 40, select: { id: true, scheduledDate: true, status: true, kind: true, supervisorName: true, summary: true, feedback: true } }),
    pendenciasDaUnidade(unitId),
    Promise.all(meses.map((m) => getUsageBoard(user, m).then((b) => b.find((x: { unitId: string }) => x.unitId === unitId)?.usagePct ?? null).catch(() => null))),
  ]);
  const evolucao = meses.map((m, i) => {
    const doMes = visitas.filter((v) => v.kind === 'OPERACIONAL' && v.status === 'DONE' && v.scheduledDate.startsWith(m)).map((v) => (v.summary as ResumoDaVisita | null)?.aderencia.pct).filter((x): x is number => x != null);
    return { ym: m, uso: usos[i], aderencia: doMes.length ? Math.round((doMes.reduce((s, n) => s + n, 0) / doMes.length) * 10) / 10 : null, visitas: doMes.length };
  });
  return {
    unidade: u,
    visitas: visitas.map((v) => ({ id: v.id, data: v.scheduledDate, status: v.status, kind: v.kind, supervisor: v.supervisorName, aderencia: (v.summary as ResumoDaVisita | null)?.aderencia.pct ?? null, naoConformes: (v.summary as ResumoDaVisita | null)?.aderencia.naoConformes ?? null, feedback: v.feedback })),
    pendencias: acoes,
    evolucao,
    ultima: visitas.find((v) => v.status === 'DONE')?.scheduledDate ?? null,
    proxima: visitas.filter((v) => v.status === 'PLANNED' && v.scheduledDate >= hoje).map((v) => v.scheduledDate).sort()[0] ?? null,
  };
}

/** Plano de ação da(s) unidade(s) do usuário — a tela do gerente. */
export async function listarAcoesDoAlcance(user: SessionUser, unitId?: string | null) {
  const hoje = hojeBR();
  const acoes = await prisma.visitAction.findMany({
    where: { AND: [unitScopeWhere(user, 'unitId'), unitId ? { unitId } : {}] },
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    take: 300,
  });
  const nomes = new Map((await prisma.unit.findMany({ where: { id: { in: [...new Set(acoes.map((a) => a.unitId))] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return acoes.map((a) => ({ ...a, unidade: nomes.get(a.unitId) ?? '', situacao: situacaoDaAcao(a, hoje) }));
}
