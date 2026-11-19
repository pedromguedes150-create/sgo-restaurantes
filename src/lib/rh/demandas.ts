import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { assertUnitAccess, UnitScopeError, unitScopeWhere } from '@/lib/scope/unit-scope';
import { enfileirarDemanda, envioDeCadaRegistro } from '@/lib/rh/saida/fila';
import { rotuloDaSituacao } from '@/lib/rh/saida/regras';
import {
  ANEXOS_MAX, ROTULO_DO_TIPO, ROTULO_DA_PRIORIDADE, TIPOS_OFERECIDOS, dataDoEvento, normalizarDetalhes, oQueFalta,
  type Detalhes, type EnvioAoRh, type LinhaDaSolicitacao, type Prioridade, type TipoDeSolicitacao,
} from '@/lib/rh/solicitacoes-regras';
import type { AnexoGuardado } from '@/lib/rh/demanda-arquivo';
import type { SessionUser } from '@/lib/auth/session';
import { Prisma, RhDemandPriority, RhDemandType } from '@prisma/client';

/**
 * Solicitação ao RH (A3 do contrato; "Demanda ao RH" até a v1.216.0): o gerente
 * registra um pedido ou uma dúvida; o SGO grava, enfileira o envio e depois
 * mostra o número, o prazo e a situação que o RH devolve. O gerente vê o
 * andamento — nunca o detalhe técnico do envio (isso é da tela do Admin).
 *
 * v1.217.0 — os campos de cada tipo, o motivo da urgência e os anexos ficam no
 * SGO; a tabela, a fila e o corpo enviado ao RH são os de sempre.
 */

type Ctx = { ip?: string | null; userAgent?: string | null };

export const TIPOS_DEMANDA: { value: RhDemandType; label: string }[] = TIPOS_OFERECIDOS.map((t) => ({ value: t, label: ROTULO_DO_TIPO[t] }));
export const PRIORIDADES_DEMANDA: { value: RhDemandPriority; label: string }[] = (['NORMAL', 'ALTA', 'URGENTE'] as const).map((p) => ({ value: p, label: ROTULO_DA_PRIORIDADE[p] }));

export interface CriarDemandaInput {
  unitId: string;
  tipo: string;
  titulo: string;
  descricao?: string;
  collaboratorId?: string | null;
  /** Só é usada quando o tipo não tem um campo de data próprio. */
  dataEvento?: string | null;
  prioridade?: string;
  detalhes?: unknown;
  urgenciaMotivo?: string;
  anexos?: AnexoGuardado[];
}
export type CriarDemandaResult = { ok: true; id: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND'; message?: string };

export async function criarDemanda(user: SessionUser, input: CriarDemandaInput, ctx: Ctx = {}): Promise<CriarDemandaResult> {
  try { assertUnitAccess(user, input.unitId); } catch (e) {
    if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' };
    throw e;
  }
  const tipo = input.tipo as RhDemandType;
  if (!Object.values(RhDemandType).includes(tipo)) return { ok: false, reason: 'INVALID', message: 'Escolha o tipo da solicitação.' };
  const prioridade = (input.prioridade || 'NORMAL') as RhDemandPriority;
  if (!Object.values(RhDemandPriority).includes(prioridade)) return { ok: false, reason: 'INVALID', message: 'Prioridade inválida.' };
  const titulo = input.titulo?.trim() ?? '';
  const descricao = input.descricao?.trim() || null;
  const detalhes = normalizarDetalhes(tipo, input.detalhes);
  const urgenciaMotivo = prioridade === 'URGENTE' ? (input.urgenciaMotivo?.trim().slice(0, 500) || null) : null;
  const anexos = input.anexos ?? [];
  if (anexos.length > ANEXOS_MAX) return { ok: false, reason: 'INVALID', message: `No máximo ${ANEXOS_MAX} anexos.` };

  const falta = oQueFalta({ tipo, titulo, descricao: descricao ?? '', prioridade, urgenciaMotivo: urgenciaMotivo ?? '', collaboratorId: input.collaboratorId || null, detalhes });
  if (falta) return { ok: false, reason: 'INVALID', message: falta };

  const avulsa = input.dataEvento?.trim() || null;
  if (avulsa && !/^\d{4}-\d{2}-\d{2}$/.test(avulsa)) return { ok: false, reason: 'INVALID', message: 'Data do evento inválida.' };
  const dataEvento = dataDoEvento(tipo, detalhes) ?? avulsa;

  let collaboratorId: string | null = null;
  if (input.collaboratorId) {
    const link = await prisma.collaboratorUnit.findUnique({ where: { collaboratorId_unitId: { collaboratorId: input.collaboratorId, unitId: input.unitId } }, select: { id: true } });
    if (!link) return { ok: false, reason: 'NOT_FOUND', message: 'Este colaborador não está vinculado a esta unidade.' };
    collaboratorId = input.collaboratorId;
  }

  const autor = await prisma.user.findUnique({ where: { id: user.id }, select: { email: true } });
  const d = await prisma.rhDemand.create({
    data: {
      unitId: input.unitId, collaboratorId, tipo, titulo, descricao, dataEvento, prioridade, createdById: user.id, createdByName: user.name, createdByEmail: autor?.email ?? null,
      detalhes: Object.keys(detalhes).length ? detalhes : Prisma.JsonNull,
      urgenciaMotivo,
      anexos: anexos.length ? (anexos as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
    },
    select: { id: true },
  });
  await audit({ userId: user.id, unitId: input.unitId, action: 'RH_DEMAND_CREATE', module: 'PEOPLE', entity: 'rh_demand', entityId: d.id, metadata: { tipo, prioridade, comColaborador: Boolean(collaboratorId), anexos: anexos.length }, ...ctx });
  await enfileirarDemanda(d.id, user.id).catch((e) => console.error('[rh-saida] falha ao enfileirar demanda:', e));
  return { ok: true, id: d.id };
}

/** Os anexos gravados na linha, já conferidos (JSON vindo do banco). */
export function anexosDaLinha(v: unknown): AnexoGuardado[] {
  if (!Array.isArray(v)) return [];
  return (v as unknown[])
    .filter((a): a is AnexoGuardado => Boolean(a) && typeof a === 'object' && typeof (a as AnexoGuardado).path === 'string' && typeof (a as AnexoGuardado).mime === 'string')
    .map((a) => ({ path: a.path, mime: a.mime, nome: typeof a.nome === 'string' ? a.nome : 'anexo', tamanho: Number(a.tamanho) || 0 }));
}

export interface DemandaDaLista extends LinhaDaSolicitacao {
  descricao: string | null;
  dataEvento: string | null;
}

type LinhaDoBanco = Prisma.RhDemandGetPayload<{ include: { unit: { select: { name: true } }; collaborator: { select: { name: true } } } }>;

function paraLinha(r: LinhaDoBanco, envio: EnvioAoRh): DemandaDaLista {
  return {
    id: r.id, tipo: r.tipo as TipoDeSolicitacao, titulo: r.titulo, descricao: r.descricao, prioridade: r.prioridade as Prioridade, dataEvento: r.dataEvento,
    unitId: r.unitId, unitName: r.unit.name, collaboratorName: r.collaborator?.name ?? null, createdById: r.createdById, createdByName: r.createdByName, createdAt: r.createdAt.toISOString(),
    rhNumero: r.rhNumero, rhPrazoAlvo: r.rhPrazoAlvo, rhSituacao: r.rhSituacao, rhSituacaoAt: r.rhSituacaoAt?.toISOString() ?? null, situacaoRotulo: rotuloDaSituacao(r.rhSituacao),
    envio, anexos: anexosDaLinha(r.anexos).length,
  };
}

/** Teto da lista. A tela diz quando ele foi atingido. */
export const LIMITE_DA_LISTA = 500;

/**
 * Lista no escopo do usuário, com o andamento — sem o detalhe técnico do envio.
 * `unitIds` e `soDoUsuario` só ESTREITAM: o recorte de verdade é o do escopo.
 */
export async function listarDemandas(user: SessionUser, filtro?: string | null | { unitIds?: string[]; soDoUsuario?: boolean }): Promise<DemandaDaLista[]> {
  const f = typeof filtro === 'string' ? { unitIds: [filtro] } : filtro ?? {};
  const rows = await prisma.rhDemand.findMany({
    where: { AND: [unitScopeWhere(user, 'unitId'), f.unitIds ? { unitId: { in: f.unitIds } } : {}, f.soDoUsuario ? { createdById: user.id } : {}] },
    orderBy: { createdAt: 'desc' },
    take: LIMITE_DA_LISTA,
    include: { unit: { select: { name: true } }, collaborator: { select: { name: true } } },
  });
  const envio = await envioDeCadaRegistro('DEMANDA', rows.map((r) => r.id));
  return rows.map((r) => paraLinha(r, envio.get(r.id) ?? 'NAO_ENVIADO'));
}

export interface DemandaCompleta extends DemandaDaLista {
  detalhes: Detalhes | null;
  urgenciaMotivo: string | null;
  arquivos: AnexoGuardado[];
}

/** Uma solicitação, só se estiver no escopo do usuário. */
export async function getDemanda(user: SessionUser, id: string): Promise<DemandaCompleta | null> {
  const r = await prisma.rhDemand.findFirst({
    where: { AND: [{ id }, unitScopeWhere(user, 'unitId')] },
    include: { unit: { select: { name: true } }, collaborator: { select: { name: true } } },
  });
  if (!r) return null;
  const envio = await envioDeCadaRegistro('DEMANDA', [r.id]);
  return {
    ...paraLinha(r, envio.get(r.id) ?? 'NAO_ENVIADO'),
    detalhes: r.detalhes && typeof r.detalhes === 'object' && !Array.isArray(r.detalhes) ? normalizarDetalhes(r.tipo as TipoDeSolicitacao, r.detalhes) : null,
    urgenciaMotivo: r.urgenciaMotivo,
    arquivos: anexosDaLinha(r.anexos),
  };
}
