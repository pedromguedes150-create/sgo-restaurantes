import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere, canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import type { PayoutType } from '@prisma/client';

/**
 * COMISSÃO E MOBILIDADE — a competência, por unidade.
 *
 * As duas modalidades vivem na mesma tabela (`CollaboratorPayout.type`) e são
 * INDEPENDENTES em tudo o mais: entrega, fechamento e arquivo. Misturá-las no
 * mesmo Excel foi o que o pedido proibiu, e a separação começa aqui, no tipo
 * entrar em toda chave — não só no filtro da tela.
 *
 * NADA de cadastro paralelo de gente: o colaborador é sempre o do SGO
 * (`Collaborator`), e **CPF e unidade são lidos do cadastro na hora de exibir e
 * exportar**, não copiados para o lançamento. Assim, correção feita no RH
 * aparece no próximo arquivo sem ninguém reescrever lançamento antigo. O nome
 * continua congelado no lançamento, que é o que mantém legível um histórico de
 * quem já saiu.
 */

type Ctx = { ip?: string | null; userAgent?: string | null };
const PODE_LANCAR = new Set(['ADMIN', 'SUPERVISOR', 'CEO']);
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const COMPETENCIA = /^\d{4}-\d{2}$/;

export type ResultadoPayout =
  | { ok: true; id?: string; gravados?: number; ignorados?: number }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' | 'FECHADA'; message?: string };

/* ─────────────────────── LEITURA, AGRUPADA POR UNIDADE ─────────────────────── */

export interface LinhaDaUnidade {
  id: string;
  collaboratorId: string;
  colaborador: string;
  /** Do cadastro, não do lançamento — correção no RH aparece sozinha. */
  cpf: string | null;
  admissaoEm: string | null;
  valor: number;
  observacao: string | null;
  lancadoPor: string;
  lancadoEm: Date;
}

export interface GrupoDeUnidade {
  unitId: string;
  unidade: string;
  lancamentos: LinhaDaUnidade[];
  total: number;
  /** Entrega registrada para esta unidade nesta competência e tipo. */
  entregaEm: string | null;
}

export interface QuadroDaCompetencia {
  competencia: string;
  tipo: PayoutType;
  grupos: GrupoDeUnidade[];
  totalGeral: number;
  totalLancamentos: number;
  /** Competência fechada trava edição e exclusão. */
  fechada: boolean;
  fechadaPor: string | null;
  fechadaEm: Date | null;
  /** Unidades do escopo sem nenhum lançamento — o que ainda falta. */
  unidadesSemLancamento: { id: string; name: string }[];
}

/** O quadro de uma competência, para UMA modalidade. */
export async function getQuadroDaCompetencia(
  user: SessionUser,
  competencia: string,
  tipo: PayoutType,
): Promise<QuadroDaCompetencia> {
  const [lancamentos, unidades, entregas, fechamento] = await Promise.all([
    prisma.collaboratorPayout.findMany({
      where: { yearMonth: competencia, type: tipo, ...unitScopeWhere(user, 'unitId') },
      orderBy: [{ collaboratorName: 'asc' }],
    }),
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.payoutDelivery.findMany({ where: { yearMonth: competencia, type: tipo, ...unitScopeWhere(user, 'unitId') } }),
    prisma.payoutClosure.findUnique({ where: { yearMonth_type: { yearMonth: competencia, type: tipo } } }),
  ]);

  /* CPF e admissão saem do CADASTRO. Ler do lançamento devolveria o valor do
     dia em que ele foi feito, e uma correção no RH nunca chegaria ao arquivo. */
  const colaboradores = await prisma.collaborator.findMany({
    where: { id: { in: [...new Set(lancamentos.map((l) => l.collaboratorId))] } },
    select: { id: true, cpf: true, hireDate: true },
  });
  const cadastro = new Map(colaboradores.map((c) => [c.id, c]));
  const entregaPor = new Map(entregas.map((e) => [e.unitId, e.deliveredAt]));
  const nomePor = new Map(unidades.map((u) => [u.id, u.name]));

  const porUnidade = new Map<string, LinhaDaUnidade[]>();
  for (const l of lancamentos) {
    const c = cadastro.get(l.collaboratorId);
    const linha: LinhaDaUnidade = {
      id: l.id,
      collaboratorId: l.collaboratorId,
      colaborador: l.collaboratorName,
      cpf: c?.cpf ?? null,
      admissaoEm: c?.hireDate ?? null,
      valor: Number(l.amount),
      observacao: l.note,
      lancadoPor: l.createdByName,
      lancadoEm: l.createdAt,
    };
    porUnidade.set(l.unitId, [...(porUnidade.get(l.unitId) ?? []), linha]);
  }

  const grupos: GrupoDeUnidade[] = [...porUnidade.entries()]
    .map(([unitId, linhas]) => ({
      unitId,
      unidade: nomePor.get(unitId) ?? '—',
      lancamentos: linhas,
      total: Math.round(linhas.reduce((s, l) => s + l.valor, 0) * 100) / 100,
      entregaEm: entregaPor.get(unitId) ?? null,
    }))
    .sort((a, b) => a.unidade.localeCompare(b.unidade, 'pt-BR'));

  return {
    competencia, tipo, grupos,
    totalGeral: Math.round(grupos.reduce((s, g) => s + g.total, 0) * 100) / 100,
    totalLancamentos: lancamentos.length,
    fechada: Boolean(fechamento),
    fechadaPor: fechamento?.closedByName ?? null,
    fechadaEm: fechamento?.closedAt ?? null,
    /* O que FALTA é tão importante quanto o que já entrou: sem esta lista, uma
       unidade esquecida só aparece quando a administradora reclama. */
    unidadesSemLancamento: unidades.filter((u) => !porUnidade.has(u.id)),
  };
}

/* ─────────────────────────── TRAVA DA COMPETÊNCIA ─────────────────────────── */

async function estaFechada(competencia: string, tipo: PayoutType): Promise<boolean> {
  return Boolean(await prisma.payoutClosure.findUnique({ where: { yearMonth_type: { yearMonth: competencia, type: tipo } } }));
}

/**
 * Fecha a competência de UMA modalidade.
 *
 * Comissão e mobilidade fecham separado de propósito: elas seguem para a
 * administradora em arquivos diferentes e em momentos diferentes, e um
 * fechamento único travaria uma por causa da outra.
 */
export async function fecharCompetencia(user: SessionUser, competencia: string, tipo: PayoutType, ctx: Ctx = {}): Promise<ResultadoPayout> {
  if (!PODE_LANCAR.has(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  if (!COMPETENCIA.test(competencia)) return { ok: false, reason: 'INVALID' };
  await prisma.payoutClosure.upsert({
    where: { yearMonth_type: { yearMonth: competencia, type: tipo } },
    create: { yearMonth: competencia, type: tipo, closedById: user.id, closedByName: user.name },
    update: {},
  });
  await audit({ userId: user.id, action: 'PAYOUT_CLOSE', module: 'PEOPLE', entity: 'payout_closure', metadata: { competencia, tipo }, ...ctx });
  return { ok: true };
}

/** Reabrir é só do Admin: é desfazer o fechamento que a competência protege. */
export async function reabrirCompetencia(user: SessionUser, competencia: string, tipo: PayoutType, ctx: Ctx = {}): Promise<ResultadoPayout> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  await prisma.payoutClosure.deleteMany({ where: { yearMonth: competencia, type: tipo } });
  /* A linha some, mas a reabertura fica na Auditoria: "fechado" é um ESTADO, e
     o histórico de idas e vindas pertence ao log, não à tabela. */
  await audit({ userId: user.id, action: 'PAYOUT_REOPEN', module: 'PEOPLE', entity: 'payout_closure', metadata: { competencia, tipo }, ...ctx });
  return { ok: true };
}

/* ───────────────────────────── DATA DE ENTREGA ───────────────────────────── */

/**
 * Registra a entrega de uma unidade na competência.
 *
 * UMA data por unidade, e não por lançamento: a entrega é do lote inteiro, e
 * pedir a data em cada linha multiplicaria por cinquenta uma informação que é
 * uma só. É ela que preenche "Data Entrega" e "Status" no arquivo.
 */
export async function registrarEntrega(
  user: SessionUser,
  input: { unitId: string; competencia: string; tipo: PayoutType; entregaEm: string | null },
  ctx: Ctx = {},
): Promise<ResultadoPayout> {
  if (!PODE_LANCAR.has(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  if (!canAccessUnit(user, input.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (!COMPETENCIA.test(input.competencia)) return { ok: false, reason: 'INVALID' };
  if (await estaFechada(input.competencia, input.tipo)) return { ok: false, reason: 'FECHADA', message: 'Competência finalizada. Reabra para alterar.' };

  /* Data vazia APAGA o registro — é como se desfaz um engano, e deixar uma
     data errada gravada mandaria "entregue" no arquivo. */
  if (!input.entregaEm) {
    await prisma.payoutDelivery.deleteMany({ where: { unitId: input.unitId, yearMonth: input.competencia, type: input.tipo } });
    await audit({ userId: user.id, unitId: input.unitId, action: 'PAYOUT_DELIVERY_CLEAR', module: 'PEOPLE', entity: 'payout_delivery', metadata: { competencia: input.competencia, tipo: input.tipo }, ...ctx });
    return { ok: true };
  }
  if (!DATA.test(input.entregaEm)) return { ok: false, reason: 'INVALID' };

  await prisma.payoutDelivery.upsert({
    where: { unitId_yearMonth_type: { unitId: input.unitId, yearMonth: input.competencia, type: input.tipo } },
    create: { unitId: input.unitId, yearMonth: input.competencia, type: input.tipo, deliveredAt: input.entregaEm, createdById: user.id, createdByName: user.name },
    update: { deliveredAt: input.entregaEm, createdById: user.id, createdByName: user.name },
  });
  await audit({ userId: user.id, unitId: input.unitId, action: 'PAYOUT_DELIVERY', module: 'PEOPLE', entity: 'payout_delivery', metadata: { competencia: input.competencia, tipo: input.tipo, entregaEm: input.entregaEm }, ...ctx });
  return { ok: true };
}

/* ────────────────────────── LANÇAMENTO EM LOTE ────────────────────────── */

export interface ItemDoLote { collaboratorId: string; amount: number; note?: string | null }

/**
 * Lança vários de uma vez.
 *
 * O caso real é "a mesma unidade, o mesmo valor para quase todos" — e por isso
 * a tela manda uma lista já com o valor por linha, permitindo ajustar os
 * poucos que fogem antes de gravar.
 *
 * Quem não passa nas conferências é IGNORADO e contado, nunca silenciado:
 * responder "40 gravados" sem dizer que 3 ficaram de fora esconderia justamente
 * os que precisam de atenção.
 */
export async function lancarEmLote(
  user: SessionUser,
  input: { competencia: string; tipo: PayoutType; itens: ItemDoLote[] },
  ctx: Ctx = {},
): Promise<ResultadoPayout> {
  if (!PODE_LANCAR.has(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  if (!COMPETENCIA.test(input.competencia)) return { ok: false, reason: 'INVALID' };
  if (await estaFechada(input.competencia, input.tipo)) return { ok: false, reason: 'FECHADA', message: 'Competência finalizada. Reabra para lançar.' };

  const limpos = input.itens.filter((i) => {
    const v = Math.round(Number(i.amount) * 100) / 100;
    return i.collaboratorId && Number.isFinite(v) && v > 0 && v <= 99999999;
  });
  if (limpos.length === 0) return { ok: false, reason: 'INVALID', message: 'Nenhum lançamento válido.' };

  const colaboradores = await prisma.collaborator.findMany({
    where: { id: { in: limpos.map((i) => i.collaboratorId) }, active: true },
    select: { id: true, name: true, units: { select: { unitId: true } } },
  });
  const por = new Map(colaboradores.map((c) => [c.id, c]));

  const data: { collaboratorId: string; collaboratorName: string; unitId: string; type: PayoutType; yearMonth: string; amount: number; note: string | null; createdById: string; createdByName: string }[] = [];
  for (const i of limpos) {
    const c = por.get(i.collaboratorId);
    if (!c) continue;
    /* A unidade sai do CADASTRO e tem de estar no escopo de quem lança — o
       corpo da requisição não escolhe unidade. */
    const unitId = c.units.find((u) => canAccessUnit(user, u.unitId))?.unitId;
    if (!unitId) continue;
    data.push({
      collaboratorId: c.id, collaboratorName: c.name, unitId, type: input.tipo,
      yearMonth: input.competencia, amount: Math.round(Number(i.amount) * 100) / 100,
      note: i.note?.trim() || null, createdById: user.id, createdByName: user.name,
    });
  }
  if (data.length === 0) return { ok: false, reason: 'FORBIDDEN', message: 'Nenhum colaborador no seu alcance.' };

  const r = await prisma.collaboratorPayout.createMany({ data });
  await audit({
    userId: user.id, action: `PAYOUT_${input.tipo}_LOTE`, module: 'PEOPLE', entity: 'collaborator_payout',
    metadata: { competencia: input.competencia, tipo: input.tipo, gravados: r.count, ignorados: input.itens.length - r.count },
    ...ctx,
  });
  return { ok: true, gravados: r.count, ignorados: input.itens.length - r.count };
}

/* ─────────────────────────── EDITAR E EXCLUIR ─────────────────────────── */

export async function editarLancamento(
  user: SessionUser,
  id: string,
  input: { amount?: number; note?: string | null },
  ctx: Ctx = {},
): Promise<ResultadoPayout> {
  if (!PODE_LANCAR.has(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const l = await prisma.collaboratorPayout.findUnique({ where: { id }, select: { unitId: true, yearMonth: true, type: true, amount: true, collaboratorName: true } });
  if (!l) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, l.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (await estaFechada(l.yearMonth, l.type)) return { ok: false, reason: 'FECHADA', message: 'Competência finalizada. Reabra para editar.' };

  const amount = input.amount != null ? Math.round(Number(input.amount) * 100) / 100 : Number(l.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 99999999) return { ok: false, reason: 'INVALID' };

  await prisma.collaboratorPayout.update({
    where: { id },
    data: { amount, ...(input.note !== undefined ? { note: input.note?.trim() || null } : {}) },
  });
  await audit({
    userId: user.id, unitId: l.unitId, action: 'PAYOUT_EDIT', module: 'PEOPLE', entity: 'collaborator_payout', entityId: id,
    metadata: { colaborador: l.collaboratorName, de: Number(l.amount), para: amount }, ...ctx,
  });
  return { ok: true };
}

export async function excluirLancamento(user: SessionUser, id: string, ctx: Ctx = {}): Promise<ResultadoPayout> {
  if (!PODE_LANCAR.has(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const l = await prisma.collaboratorPayout.findUnique({ where: { id }, select: { unitId: true, yearMonth: true, type: true, amount: true, collaboratorName: true } });
  if (!l) return { ok: false, reason: 'NOT_FOUND' };
  if (!canAccessUnit(user, l.unitId)) return { ok: false, reason: 'FORBIDDEN' };
  if (await estaFechada(l.yearMonth, l.type)) return { ok: false, reason: 'FECHADA', message: 'Competência finalizada. Reabra para excluir.' };

  await prisma.collaboratorPayout.delete({ where: { id } });
  await audit({
    userId: user.id, unitId: l.unitId, action: 'PAYOUT_DELETE', module: 'PEOPLE', entity: 'collaborator_payout', entityId: id,
    metadata: { colaborador: l.collaboratorName, valor: Number(l.amount), competencia: l.yearMonth, tipo: l.type }, ...ctx,
  });
  return { ok: true };
}
