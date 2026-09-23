import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { notifyUnitRole } from '@/lib/notifications';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { currentOperationalDate } from '@/lib/date/operational';
import { unidadePorToken } from '@/lib/pizzas/acesso';
import { emBR } from '@/lib/pizzas/tipos';
import {
  calcularDia, calcularDias, estoqueAtual, posicaoDosLotes, resumoDoPeriodo,
  type DiaDeMassas, type PosicaoDosLotes, type ResumoDeMassas, type SerieDeMassas,
} from '@/lib/pizzas/massas-calculo';
import {
  FORMATO_DATA, contagemValida, ehMotivo, quantidadeDeMassas, textoLimpo, type MotivoDesperdicio,
} from '@/lib/pizzas/massas-tipos';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Controle de Massas — a camada de servidor em cima do motor puro.
 *
 * DUAS PORTAS para a mesma gravação:
 *  - LINK público (token): só o DIA OPERACIONAL ATUAL. Recebe, registra
 *    desperdício, conta e corrige o que é de hoje; dia anterior é recusado.
 *  - SESSÃO (gerente/supervisão/admin): qualquer dia até hoje; dia anterior
 *    exige MOTIVO e é marcado como retroativo.
 *
 * Toda mudança, das duas portas, vira uma linha em `PizzaDoughChange` (antes,
 * depois, quem, quando, motivo) — e entra na Auditoria. Nada some calado: a
 * exclusão é lógica (`deletedAt`).
 */

type Ctx = { ip?: string | null; userAgent?: string | null };

/** Quem está gravando: o link (sem sessão) ou um usuário logado. */
export type Autor =
  | { tipo: 'link' }
  | { tipo: 'usuario'; user: SessionUser };

export type MotivoRecusaMassas =
  | 'TOKEN' | 'FORBIDDEN' | 'NOT_FOUND' | 'DATA' | 'DIA_FECHADO' | 'QUANTIDADE' | 'VALIDADE'
  | 'MOTIVO' | 'LOTE' | 'SEM_JUSTIFICATIVA' | 'SEM_MOTIVO_ALTERACAO';

export type ResultadoMassas<T = { id: string }> =
  | ({ ok: true } & T)
  | { ok: false; reason: MotivoRecusaMassas };

/** Perfis que podem corrigir dias anteriores (além do próprio dia). */
const CORRIGE_RETROATIVO: SessionUser['role'][] = ['MANAGER', 'SUPERVISOR', 'ADMIN', 'CEO'];

interface UnidadeAlvo { id: string; name: string; timezone: string; cutoffHour: number }

/* ─────────────────────────── leitura da série ─────────────────────────── */

/** Toda a série da unidade (o volume de uma pizzaria cabe numa leitura). */
export async function serieDaUnidade(unitId: string): Promise<SerieDeMassas> {
  const [lotes, desperdicios, contagens, contagensVenda, itensLegados] = await Promise.all([
    prisma.pizzaDoughBatch.findMany({ where: { unitId, deletedAt: null }, orderBy: [{ operationalDate: 'asc' }, { createdAt: 'asc' }] }),
    prisma.pizzaDoughWaste.findMany({ where: { unitId, deletedAt: null }, orderBy: [{ operationalDate: 'asc' }, { createdAt: 'asc' }] }),
    prisma.pizzaDoughCount.findMany({ where: { unitId } }),
    prisma.pizzaClosingCount.findMany({ where: { closing: { unitId } }, select: { quantity: true, closing: { select: { operationalDate: true } } } }),
    prisma.pizzaClosingItem.findMany({ where: { closing: { unitId } }, select: { quantity: true, closing: { select: { operationalDate: true } } } }),
  ]);

  /* 1 pizza = 1 massa. As DUAS fontes do fechamento de vendas (por canal e o
     legado por sabor) — a mesma decisão do painel de pizzas: um dia tem uma
     OU outra, nunca as duas. */
  const vendasPorDia = new Map<string, number>();
  for (const c of [...contagensVenda, ...itensLegados]) {
    const d = c.closing.operationalDate;
    vendasPorDia.set(d, (vendasPorDia.get(d) ?? 0) + c.quantity);
  }

  return {
    lotes: lotes.map((l) => ({ id: l.id, data: l.operationalDate, quantidade: l.quantity, validade: l.expiresAt, lotCode: l.lotCode })),
    desperdicios: desperdicios.map((w) => ({ id: w.id, data: w.operationalDate, quantidade: w.quantity, motivo: w.reason as MotivoDesperdicio, loteId: w.batchId })),
    contagens: contagens.map((c) => ({ data: c.operationalDate, fisico: c.physicalQty, esperadoNoFechamento: c.expectedAtClose })),
    vendasPorDia,
  };
}

export interface LancamentoDoDia {
  recebimentos: { id: string; quantidade: number; validade: string; lotCode: string | null }[];
  desperdicios: { id: string; quantidade: number; motivo: MotivoDesperdicio; observacao: string | null; temFoto: boolean; loteId: string | null }[];
  contagem: { fisico: number; justificativa: string | null; atualizadoEm: string } | null;
}

export interface EstadoDoDia {
  hoje: string;
  data: string;
  dia: DiaDeMassas;
  lancamentos: LancamentoDoDia;
  lotes: PosicaoDosLotes;
  vendasFechadas: boolean;
}

/** O que o link mostra ao abrir: o dia, seus lançamentos e a posição dos lotes. */
export async function estadoDoDia(unit: UnidadeAlvo, data: string): Promise<EstadoDoDia> {
  const hoje = currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour });
  const [serie, recebimentos, desperdicios, contagem] = await Promise.all([
    serieDaUnidade(unit.id),
    prisma.pizzaDoughBatch.findMany({ where: { unitId: unit.id, operationalDate: data, deletedAt: null }, orderBy: { createdAt: 'asc' } }),
    prisma.pizzaDoughWaste.findMany({ where: { unitId: unit.id, operationalDate: data, deletedAt: null }, orderBy: { createdAt: 'asc' } }),
    prisma.pizzaDoughCount.findUnique({ where: { unitId_operationalDate: { unitId: unit.id, operationalDate: data } } }),
  ]);
  return {
    hoje,
    data,
    dia: calcularDia(serie, data),
    lancamentos: {
      recebimentos: recebimentos.map((r) => ({ id: r.id, quantidade: r.quantity, validade: r.expiresAt, lotCode: r.lotCode })),
      desperdicios: desperdicios.map((w) => ({ id: w.id, quantidade: w.quantity, motivo: w.reason as MotivoDesperdicio, observacao: w.observation, temFoto: Boolean(w.photoPath), loteId: w.batchId })),
      contagem: contagem ? { fisico: contagem.physicalQty, justificativa: contagem.justification, atualizadoEm: contagem.updatedAt.toISOString() } : null,
    },
    lotes: posicaoDosLotes(serie, data, hoje),
    vendasFechadas: serie.vendasPorDia.has(data),
  };
}

export interface PainelDeMassas {
  de: string;
  ate: string;
  resumo: ResumoDeMassas;
  dias: DiaDeMassas[];
  lotes: PosicaoDosLotes;
  alteracoes: {
    id: string; entidade: string; data: string; antes: unknown; depois: unknown;
    por: string; motivo: string | null; retroativa: boolean; em: string;
  }[];
}

/** O painel administrativo do período. */
export async function painelDeMassas(unitId: string, opcoes: { de: string; ate: string; hoje: string }): Promise<PainelDeMassas> {
  const { de, ate, hoje } = opcoes;
  const [serie, alteracoes] = await Promise.all([
    serieDaUnidade(unitId),
    prisma.pizzaDoughChange.findMany({
      where: { unitId, operationalDate: { gte: de, lte: ate } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);
  /* Só dias com algum movimento OU contagem entram na tabela: dia parado é
     linha sem informação e a lista de 90 dias viraria papel de parede. */
  const dias = calcularDias(serie, de, ate).filter((d) => d.recebidas || d.vendidas || d.desperdicadas || d.fisico !== null);
  const lotes = posicaoDosLotes(serie, hoje, hoje);
  return {
    de, ate,
    resumo: resumoDoPeriodo(dias, lotes, estoqueAtual(serie, hoje)),
    dias,
    lotes,
    alteracoes: alteracoes.map((a) => ({
      id: a.id, entidade: a.entity, data: a.operationalDate, antes: a.before, depois: a.after,
      por: a.changedByName ?? 'Link da pizzaria', motivo: a.reason, retroativa: a.retroactive, em: a.createdAt.toISOString(),
    })),
  };
}

/* ─────────────────────────── porta + regra de edição ─────────────────────────── */

interface Porta {
  unit: UnidadeAlvo;
  hoje: string;
  autor: Autor;
}

/** Resolve a unidade pelo token do link. */
export async function portaDoLink(token: string): Promise<Porta | null> {
  const unit = await unidadePorToken(token);
  if (!unit) return null;
  return { unit, hoje: currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour }), autor: { tipo: 'link' } };
}

/** Resolve a unidade para um usuário logado: perfil que corrige + escopo + pizzaria. */
export async function portaDaSessao(user: SessionUser, unitId: string): Promise<Porta | null> {
  if (!CORRIGE_RETROATIVO.includes(user.role)) return null;
  if (!canAccessUnit(user, unitId)) return null;
  const unit = await prisma.unit.findFirst({ where: { id: unitId, active: true, hasPizzeria: true }, select: { id: true, name: true, timezone: true, cutoffHour: true } });
  if (!unit) return null;
  return { unit, hoje: currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour }), autor: { tipo: 'usuario', user } };
}

/**
 * A regra de edição, num lugar só.
 *
 * - Futuro: nunca.
 * - Link: só o dia operacional ATUAL (DIA_FECHADO para qualquer outro).
 * - Sessão: qualquer dia até hoje; dia anterior exige motivo.
 */
function podeMexerNoDia(p: Porta, data: string, motivo: string | null): { ok: true; retroativo: boolean } | { ok: false; reason: MotivoRecusaMassas } {
  if (!FORMATO_DATA.test(data)) return { ok: false, reason: 'DATA' };
  if (data > p.hoje) return { ok: false, reason: 'DATA' };
  if (data === p.hoje) return { ok: true, retroativo: false };
  if (p.autor.tipo === 'link') return { ok: false, reason: 'DIA_FECHADO' };
  if (!motivo) return { ok: false, reason: 'SEM_MOTIVO_ALTERACAO' };
  return { ok: true, retroativo: true };
}

async function registrarMudanca(p: Porta, e: {
  entidade: 'recebimento' | 'desperdicio' | 'contagem';
  entityId: string; data: string; antes: unknown; depois: unknown; motivo: string | null; retroativo: boolean; acao: string;
}, ctx: Ctx) {
  const userId = p.autor.tipo === 'usuario' ? p.autor.user.id : null;
  const nome = p.autor.tipo === 'usuario' ? p.autor.user.name : null;
  await prisma.pizzaDoughChange.create({
    data: {
      unitId: p.unit.id, entity: e.entidade, entityId: e.entityId, operationalDate: e.data,
      before: e.antes === null ? undefined : (e.antes as object),
      after: e.depois === null ? undefined : (e.depois as object),
      changedById: userId, changedByName: nome, reason: e.motivo, retroactive: e.retroativo,
    },
  });
  await audit({
    userId, unitId: p.unit.id, action: e.acao, module: 'PIZZAS', entity: `pizza_dough_${e.entidade}`, entityId: e.entityId,
    metadata: { operationalDate: e.data, antes: e.antes, depois: e.depois, motivo: e.motivo, retroativo: e.retroativo, origem: p.autor.tipo === 'link' ? 'link-publico' : 'sgo' },
    ...ctx,
  });
}

/* ─────────────────────────── recebimento (lote) ─────────────────────────── */

export interface RecebimentoInput {
  data: string;
  quantidade: number;
  validade: string;
  lotCode?: string | null;
  motivo?: string | null;
}

function validarRecebimento(i: RecebimentoInput): MotivoRecusaMassas | null {
  if (!quantidadeDeMassas(i.quantidade)) return 'QUANTIDADE';
  if (!FORMATO_DATA.test(i.validade)) return 'VALIDADE';
  return null;
}

const retratoDoLote = (l: { quantity: number; expiresAt: string; lotCode: string | null }) => ({ quantidade: l.quantity, validade: l.expiresAt, lote: l.lotCode });

export async function registrarRecebimento(p: Porta, input: RecebimentoInput, ctx: Ctx = {}): Promise<ResultadoMassas> {
  const motivo = textoLimpo(input.motivo);
  const porta = podeMexerNoDia(p, input.data, motivo);
  if (!porta.ok) return porta;
  const invalido = validarRecebimento(input);
  if (invalido) return { ok: false, reason: invalido };

  const lote = await prisma.pizzaDoughBatch.create({
    data: {
      unitId: p.unit.id, operationalDate: input.data, quantity: input.quantidade, expiresAt: input.validade,
      lotCode: textoLimpo(input.lotCode)?.slice(0, 60) ?? null,
      createdById: p.autor.tipo === 'usuario' ? p.autor.user.id : null,
    },
  });
  await registrarMudanca(p, { entidade: 'recebimento', entityId: lote.id, data: input.data, antes: null, depois: retratoDoLote(lote), motivo, retroativo: porta.retroativo, acao: 'PIZZA_DOUGH_BATCH_CREATE' }, ctx);
  return { ok: true, id: lote.id };
}

export async function corrigirRecebimento(p: Porta, id: string, input: Omit<RecebimentoInput, 'data'>, ctx: Ctx = {}): Promise<ResultadoMassas> {
  const atual = await prisma.pizzaDoughBatch.findFirst({ where: { id, unitId: p.unit.id, deletedAt: null } });
  if (!atual) return { ok: false, reason: 'NOT_FOUND' };
  const motivo = textoLimpo(input.motivo);
  const porta = podeMexerNoDia(p, atual.operationalDate, motivo);
  if (!porta.ok) return porta;
  const invalido = validarRecebimento({ ...input, data: atual.operationalDate });
  if (invalido) return { ok: false, reason: invalido };

  const novo = await prisma.pizzaDoughBatch.update({
    where: { id }, data: { quantity: input.quantidade, expiresAt: input.validade, lotCode: textoLimpo(input.lotCode)?.slice(0, 60) ?? null },
  });
  await registrarMudanca(p, { entidade: 'recebimento', entityId: id, data: atual.operationalDate, antes: retratoDoLote(atual), depois: retratoDoLote(novo), motivo, retroativo: porta.retroativo, acao: 'PIZZA_DOUGH_BATCH_UPDATE' }, ctx);
  return { ok: true, id };
}

export async function excluirRecebimento(p: Porta, id: string, motivo: string | null | undefined, ctx: Ctx = {}): Promise<ResultadoMassas> {
  const atual = await prisma.pizzaDoughBatch.findFirst({ where: { id, unitId: p.unit.id, deletedAt: null } });
  if (!atual) return { ok: false, reason: 'NOT_FOUND' };
  const m = textoLimpo(motivo);
  const porta = podeMexerNoDia(p, atual.operationalDate, m);
  if (!porta.ok) return porta;
  await prisma.pizzaDoughBatch.update({ where: { id }, data: { deletedAt: new Date() } });
  await registrarMudanca(p, { entidade: 'recebimento', entityId: id, data: atual.operationalDate, antes: retratoDoLote(atual), depois: null, motivo: m, retroativo: porta.retroativo, acao: 'PIZZA_DOUGH_BATCH_DELETE' }, ctx);
  return { ok: true, id };
}

/* ─────────────────────────── desperdício ─────────────────────────── */

export interface DesperdicioInput {
  data: string;
  quantidade: number;
  motivo: MotivoDesperdicio;
  observacao?: string | null;
  loteId?: string | null;
  photoPath?: string | null;
  /** Motivo da ALTERAÇÃO (retroativa) — não confundir com o motivo do desperdício. */
  motivoAlteracao?: string | null;
}

const retratoDoDesperdicio = (w: { quantity: number; reason: string; observation: string | null; batchId: string | null }) =>
  ({ quantidade: w.quantity, motivo: w.reason, observacao: w.observation, lote: w.batchId });

async function loteValido(unitId: string, loteId: string | null | undefined): Promise<boolean> {
  if (!loteId) return true;
  const n = await prisma.pizzaDoughBatch.count({ where: { id: loteId, unitId, deletedAt: null } });
  return n > 0;
}

export async function registrarDesperdicio(p: Porta, input: DesperdicioInput, ctx: Ctx = {}): Promise<ResultadoMassas> {
  const motivoAlt = textoLimpo(input.motivoAlteracao);
  const porta = podeMexerNoDia(p, input.data, motivoAlt);
  if (!porta.ok) return porta;
  if (!quantidadeDeMassas(input.quantidade)) return { ok: false, reason: 'QUANTIDADE' };
  if (!ehMotivo(input.motivo)) return { ok: false, reason: 'MOTIVO' };
  if (!(await loteValido(p.unit.id, input.loteId))) return { ok: false, reason: 'LOTE' };

  const w = await prisma.pizzaDoughWaste.create({
    data: {
      unitId: p.unit.id, operationalDate: input.data, quantity: input.quantidade, reason: input.motivo,
      observation: textoLimpo(input.observacao), batchId: input.loteId || null, photoPath: input.photoPath ?? null,
      createdById: p.autor.tipo === 'usuario' ? p.autor.user.id : null,
    },
  });
  await registrarMudanca(p, { entidade: 'desperdicio', entityId: w.id, data: input.data, antes: null, depois: retratoDoDesperdicio(w), motivo: motivoAlt, retroativo: porta.retroativo, acao: 'PIZZA_DOUGH_WASTE_CREATE' }, ctx);
  return { ok: true, id: w.id };
}

export async function corrigirDesperdicio(p: Porta, id: string, input: Omit<DesperdicioInput, 'data' | 'photoPath'>, ctx: Ctx = {}): Promise<ResultadoMassas> {
  const atual = await prisma.pizzaDoughWaste.findFirst({ where: { id, unitId: p.unit.id, deletedAt: null } });
  if (!atual) return { ok: false, reason: 'NOT_FOUND' };
  const motivoAlt = textoLimpo(input.motivoAlteracao);
  const porta = podeMexerNoDia(p, atual.operationalDate, motivoAlt);
  if (!porta.ok) return porta;
  if (!quantidadeDeMassas(input.quantidade)) return { ok: false, reason: 'QUANTIDADE' };
  if (!ehMotivo(input.motivo)) return { ok: false, reason: 'MOTIVO' };
  if (!(await loteValido(p.unit.id, input.loteId))) return { ok: false, reason: 'LOTE' };

  const novo = await prisma.pizzaDoughWaste.update({
    where: { id }, data: { quantity: input.quantidade, reason: input.motivo, observation: textoLimpo(input.observacao), batchId: input.loteId || null },
  });
  await registrarMudanca(p, { entidade: 'desperdicio', entityId: id, data: atual.operationalDate, antes: retratoDoDesperdicio(atual), depois: retratoDoDesperdicio(novo), motivo: motivoAlt, retroativo: porta.retroativo, acao: 'PIZZA_DOUGH_WASTE_UPDATE' }, ctx);
  return { ok: true, id };
}

export async function excluirDesperdicio(p: Porta, id: string, motivo: string | null | undefined, ctx: Ctx = {}): Promise<ResultadoMassas> {
  const atual = await prisma.pizzaDoughWaste.findFirst({ where: { id, unitId: p.unit.id, deletedAt: null } });
  if (!atual) return { ok: false, reason: 'NOT_FOUND' };
  const m = textoLimpo(motivo);
  const porta = podeMexerNoDia(p, atual.operationalDate, m);
  if (!porta.ok) return porta;
  await prisma.pizzaDoughWaste.update({ where: { id }, data: { deletedAt: new Date() } });
  await registrarMudanca(p, { entidade: 'desperdicio', entityId: id, data: atual.operationalDate, antes: retratoDoDesperdicio(atual), depois: null, motivo: m, retroativo: porta.retroativo, acao: 'PIZZA_DOUGH_WASTE_DELETE' }, ctx);
  return { ok: true, id };
}

/* ─────────────────────────── fechamento (contagem física) ─────────────────────────── */

export interface ContagemInput {
  data: string;
  fisico: number;
  justificativa?: string | null;
  motivoAlteracao?: string | null;
}

export type ResultadoContagem = ResultadoMassas<{ id: string; esperado: number; divergencia: number }>;

/**
 * "Quantas massas existem fisicamente na câmara fria agora?"
 *
 * O esperado é calculado AQUI, no servidor, e congelado em `expectedAtClose`.
 * Divergência exige justificativa. Refazer a contagem do mesmo dia é correção
 * (registrada); o esperado congelado passa a ser o do momento da recontagem —
 * ela é a nova verdade daquele fechamento.
 */
export async function registrarContagem(p: Porta, input: ContagemInput, ctx: Ctx = {}): Promise<ResultadoContagem> {
  const motivoAlt = textoLimpo(input.motivoAlteracao);
  const porta = podeMexerNoDia(p, input.data, motivoAlt);
  if (!porta.ok) return porta;
  if (!contagemValida(input.fisico)) return { ok: false, reason: 'QUANTIDADE' };

  const serie = await serieDaUnidade(p.unit.id);
  const dia = calcularDia(serie, input.data);
  const esperado = dia.esperado;
  const divergencia = input.fisico - esperado;
  const justificativa = textoLimpo(input.justificativa);
  if (divergencia !== 0 && !justificativa) return { ok: false, reason: 'SEM_JUSTIFICATIVA' };

  const atual = await prisma.pizzaDoughCount.findUnique({ where: { unitId_operationalDate: { unitId: p.unit.id, operationalDate: input.data } } });
  const c = await prisma.pizzaDoughCount.upsert({
    where: { unitId_operationalDate: { unitId: p.unit.id, operationalDate: input.data } },
    create: { unitId: p.unit.id, operationalDate: input.data, physicalQty: input.fisico, expectedAtClose: esperado, justification: justificativa, createdById: p.autor.tipo === 'usuario' ? p.autor.user.id : null },
    /* Correção retroativa de uma contagem antiga NÃO reescreve o esperado
       congelado: ele é o retrato do que o sistema esperava naquele dia. Só a
       recontagem do próprio dia atualiza os dois. */
    update: porta.retroativo
      ? { physicalQty: input.fisico, justification: justificativa }
      : { physicalQty: input.fisico, expectedAtClose: esperado, justification: justificativa },
  });

  const retrato = (x: { physicalQty: number; expectedAtClose: number; justification: string | null }) => ({ fisico: x.physicalQty, esperado: x.expectedAtClose, justificativa: x.justification });
  await registrarMudanca(p, {
    entidade: 'contagem', entityId: c.id, data: input.data, antes: atual ? retrato(atual) : null, depois: retrato(c),
    motivo: motivoAlt, retroativo: porta.retroativo, acao: atual ? 'PIZZA_DOUGH_COUNT_UPDATE' : 'PIZZA_DOUGH_COUNT_CREATE',
  }, ctx);

  /* A divergência do dia é o que o gerente precisa ver; fechamento que bate
     seria um aviso por noite, que é como se ensina a ignorar avisos. */
  if (divergencia !== 0 && p.autor.tipo === 'link') {
    await notifyUnitRole(p.unit.id, 'MANAGER', {
      title: 'Divergência no estoque de massas',
      body: `${p.unit.name}: em ${emBR(input.data)} a câmara tinha ${input.fisico} massa(s) e o esperado era ${esperado} (${divergencia > 0 ? '+' : ''}${divergencia}). Justificativa: ${justificativa}.`,
      link: `/modulos/pizzas?aba=massas`,
      module: 'PIZZAS',
      critical: false,
    }).catch(() => {});
  }

  return { ok: true, id: c.id, esperado, divergencia };
}
