import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { assertUnitAccess, UnitScopeError, unitScopeWhere } from '@/lib/scope/unit-scope';
import { enfileirarDemanda, envioDeCadaRegistro, type EnvioResumido } from '@/lib/rh/saida/fila';
import { DESCRICAO_MAX, TITULO_MAX, rotuloDaSituacao } from '@/lib/rh/saida/regras';
import type { SessionUser } from '@/lib/auth/session';
import { RhDemandPriority, RhDemandType } from '@prisma/client';

/**
 * Demanda ao RH (A3 do contrato, v1.168.0): o gerente registra um pedido ou
 * uma dúvida; o SGO grava, enfileira o envio e depois mostra o número, o prazo
 * e a situação que o RH devolve. O gerente vê o andamento — nunca o detalhe
 * técnico do envio (isso é da tela do Admin).
 */

type Ctx = { ip?: string | null; userAgent?: string | null };

export const TIPOS_DEMANDA: { value: RhDemandType; label: string }[] = [
  { value: 'ADMISSAO', label: 'Admissão' },
  { value: 'DESLIGAMENTO', label: 'Desligamento' },
  { value: 'ATESTADO', label: 'Atestado' },
  { value: 'FERIAS', label: 'Férias' },
  { value: 'MUDANCA_HORARIO', label: 'Mudança de horário' },
  { value: 'MUDANCA_FUNCAO_SALARIO', label: 'Mudança de função / salário' },
  { value: 'BENEFICIO', label: 'Benefício' },
  { value: 'DUVIDA', label: 'Dúvida' },
  { value: 'OUTRO', label: 'Outro' },
];
export const PRIORIDADES_DEMANDA: { value: RhDemandPriority; label: string }[] = [
  { value: 'NORMAL', label: 'Normal' },
  { value: 'ALTA', label: 'Alta' },
  { value: 'URGENTE', label: 'Urgente' },
];

export interface CriarDemandaInput {
  unitId: string;
  tipo: string;
  titulo: string;
  descricao?: string;
  collaboratorId?: string | null;
  dataEvento?: string | null;
  prioridade?: string;
}
export type CriarDemandaResult = { ok: true; id: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND'; message?: string };

export async function criarDemanda(user: SessionUser, input: CriarDemandaInput, ctx: Ctx = {}): Promise<CriarDemandaResult> {
  try { assertUnitAccess(user, input.unitId); } catch (e) {
    if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' };
    throw e;
  }
  const tipo = input.tipo as RhDemandType;
  if (!Object.values(RhDemandType).includes(tipo)) return { ok: false, reason: 'INVALID', message: 'Escolha o tipo da demanda.' };
  const prioridade = (input.prioridade || 'NORMAL') as RhDemandPriority;
  if (!Object.values(RhDemandPriority).includes(prioridade)) return { ok: false, reason: 'INVALID', message: 'Prioridade inválida.' };
  const titulo = input.titulo?.trim() ?? '';
  if (!titulo || titulo.length > TITULO_MAX) return { ok: false, reason: 'INVALID', message: `Informe um resumo de até ${TITULO_MAX} caracteres.` };
  const descricao = input.descricao?.trim() || null;
  if (descricao && descricao.length > DESCRICAO_MAX) return { ok: false, reason: 'INVALID', message: `A descrição passa de ${DESCRICAO_MAX} caracteres.` };
  const dataEvento = input.dataEvento?.trim() || null;
  if (dataEvento && !/^\d{4}-\d{2}-\d{2}$/.test(dataEvento)) return { ok: false, reason: 'INVALID', message: 'Data do evento inválida.' };

  let collaboratorId: string | null = null;
  if (input.collaboratorId) {
    const link = await prisma.collaboratorUnit.findUnique({ where: { collaboratorId_unitId: { collaboratorId: input.collaboratorId, unitId: input.unitId } }, select: { id: true } });
    if (!link) return { ok: false, reason: 'NOT_FOUND', message: 'Este colaborador não está vinculado a esta unidade.' };
    collaboratorId = input.collaboratorId;
  }

  const autor = await prisma.user.findUnique({ where: { id: user.id }, select: { email: true } });
  const d = await prisma.rhDemand.create({
    data: { unitId: input.unitId, collaboratorId, tipo, titulo, descricao, dataEvento, prioridade, createdById: user.id, createdByName: user.name, createdByEmail: autor?.email ?? null },
    select: { id: true },
  });
  await audit({ userId: user.id, unitId: input.unitId, action: 'RH_DEMAND_CREATE', module: 'PEOPLE', entity: 'rh_demand', entityId: d.id, metadata: { tipo, prioridade, comColaborador: Boolean(collaboratorId) }, ...ctx });
  await enfileirarDemanda(d.id, user.id).catch((e) => console.error('[rh-saida] falha ao enfileirar demanda:', e));
  return { ok: true, id: d.id };
}

export interface DemandaDaLista {
  id: string; tipo: RhDemandType; titulo: string; descricao: string | null; prioridade: RhDemandPriority; dataEvento: string | null;
  unitName: string; collaboratorName: string | null; createdByName: string; createdAt: string;
  rhNumero: string | null; rhPrazoAlvo: string | null; rhSituacao: string | null; situacaoRotulo: string; envio: EnvioResumido;
}

/** Lista no escopo do usuário, com o andamento — sem o detalhe técnico do envio. */
export async function listarDemandas(user: SessionUser, unitId?: string | null): Promise<DemandaDaLista[]> {
  const rows = await prisma.rhDemand.findMany({
    where: { ...unitScopeWhere(user, 'unitId'), ...(unitId ? { unitId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { unit: { select: { name: true } }, collaborator: { select: { name: true } } },
  });
  const envio = await envioDeCadaRegistro('DEMANDA', rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id, tipo: r.tipo, titulo: r.titulo, descricao: r.descricao, prioridade: r.prioridade, dataEvento: r.dataEvento,
    unitName: r.unit.name, collaboratorName: r.collaborator?.name ?? null, createdByName: r.createdByName, createdAt: r.createdAt.toISOString(),
    rhNumero: r.rhNumero, rhPrazoAlvo: r.rhPrazoAlvo, rhSituacao: r.rhSituacao, situacaoRotulo: rotuloDaSituacao(r.rhSituacao),
    envio: envio.get(r.id) ?? 'NAO_ENVIADO',
  }));
}
