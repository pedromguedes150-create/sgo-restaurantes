import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import type { SessionUser } from '@/lib/auth/session';
import { rh, type RhApi } from '@/lib/rh/transporte';
import { unwrapColaboradores, classificarStatus, type RhColaborador } from '@/lib/rh/normalize';
import { normalizarCnpj } from '@/lib/rh/vinculo';

/**
 * RECUPERAÇÃO dos inativados por ausência (v1.132.1).
 *
 * A regra antiga inativava quem "não veio na lista" do RH. Na rodada da
 * v1.132.0 o vínculo por CNPJ trouxe, para algumas unidades, um conjunto
 * diferente do que a razão social trazia — e quem ficou de fora foi marcado
 * inativo sem ter sido desligado. O `Collaborator` não guarda "quando foi
 * inativado", então a reconstrução usa a única testemunha que existe: o
 * PRÓPRIO RH, hoje. Para cada inativo da unidade:
 *   - o RH devolve a matrícula com status de desligamento → inativo LEGÍTIMO;
 *   - o RH devolve a matrícula com status ativo/férias/outro → foi inativado
 *     só por ausência na lista daquela unidade (transferência ou CNPJ) — é o
 *     que se restaura;
 *   - o RH não devolve a matrícula em empresa nenhuma → não consta no RH
 *     (inativação antiga, por ausência de verdade) — fica como está;
 *   - sem matrícula → o sync nunca o tocou.
 * Só LÊ. A reativação é ação separada, do Admin, com confirmação, e só toca
 * quem a análise classificar como inativado por ausência NAQUELE momento.
 */

export type MotivoDoInativo = 'INATIVADO_POR_AUSENCIA' | 'DESLIGADO_NO_RH' | 'NAO_CONSTA_NO_RH' | 'SEM_MATRICULA';

export const MOTIVO_LABEL: Record<MotivoDoInativo, string> = {
  INATIVADO_POR_AUSENCIA: 'Inativado por ausência — RH diz que trabalha',
  DESLIGADO_NO_RH: 'Desligado no RH',
  NAO_CONSTA_NO_RH: 'Não consta no RH',
  SEM_MATRICULA: 'Sem matrícula',
};

export interface InativoAnalisado {
  id: string;
  externalId: string | null;
  name: string;
  jobTitle: string | null;
  /** Unidades do SGO a que está vinculado. */
  unidades: string[];
  statusNoRh: string | null;
  empresaNoRh: string | null;
  cnpjNoRh: string | null;
  /** Unidade do SGO cujo CNPJ é o da empresa que o RH informa (pista de transferência). */
  unidadeDoCnpjNoSgo: string | null;
  motivo: MotivoDoInativo;
}

export interface AnaliseDeInativos {
  unitId: string;
  unitName: string;
  itens: InativoAnalisado[];
  resumo: Record<MotivoDoInativo, number>;
  erro: string | null;
}

async function listaCompleta(api: RhApi): Promise<RhColaborador[]> {
  return unwrapColaboradores(await api.colaboradores());
}

export async function analisarInativos(user: SessionUser, unitId: string, api: RhApi = rh): Promise<AnaliseDeInativos | null> {
  if (!canAccessUnit(user, unitId)) return null;
  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { id: true, name: true } });
  if (!unit) return null;
  const base: AnaliseDeInativos = {
    unitId: unit.id, unitName: unit.name, itens: [], erro: null,
    resumo: { INATIVADO_POR_AUSENCIA: 0, DESLIGADO_NO_RH: 0, NAO_CONSTA_NO_RH: 0, SEM_MATRICULA: 0 },
  };

  const inativos = await prisma.collaborator.findMany({
    where: { source: 'RH', active: false, units: { some: { unitId } } },
    orderBy: { name: 'asc' },
    select: { id: true, externalId: true, name: true, jobTitle: true, units: { select: { unit: { select: { name: true } } } } },
  });
  if (inativos.length === 0) return base;

  let todos: RhColaborador[];
  try { todos = await listaCompleta(api); } catch (e) {
    base.erro = `Não deu para consultar o RH agora: ${e instanceof Error ? e.message : String(e)}`;
    return base;
  }
  const porMatricula = new Map(todos.filter((c) => c.matricula).map((c) => [String(c.matricula), c]));

  const unidadesDoSgo = await prisma.unit.findMany({ where: { active: true, cnpj: { not: null } }, select: { name: true, cnpj: true } });
  const unidadePorCnpj = new Map(unidadesDoSgo.map((u) => [normalizarCnpj(u.cnpj), u.name]).filter((p): p is [string, string] => Boolean(p[0])));

  for (const c of inativos) {
    const noRh = c.externalId ? porMatricula.get(c.externalId) : undefined;
    let motivo: MotivoDoInativo;
    if (!c.externalId) motivo = 'SEM_MATRICULA';
    else if (!noRh) motivo = 'NAO_CONSTA_NO_RH';
    else if (classificarStatus(noRh.status) === 'DESLIGADO') motivo = 'DESLIGADO_NO_RH';
    else motivo = 'INATIVADO_POR_AUSENCIA';
    const cnpjNoRh = noRh ? normalizarCnpj(noRh.unidade_cnpj) : null;
    base.resumo[motivo]++;
    base.itens.push({
      id: c.id, externalId: c.externalId, name: c.name, jobTitle: c.jobTitle,
      unidades: c.units.map((u) => u.unit.name),
      statusNoRh: noRh?.status ?? null,
      empresaNoRh: noRh?.unidade ?? null,
      cnpjNoRh,
      unidadeDoCnpjNoSgo: cnpjNoRh ? unidadePorCnpj.get(cnpjNoRh) ?? null : null,
      motivo,
    });
  }
  const peso: Record<MotivoDoInativo, number> = { INATIVADO_POR_AUSENCIA: 0, NAO_CONSTA_NO_RH: 1, DESLIGADO_NO_RH: 2, SEM_MATRICULA: 3 };
  base.itens.sort((a, b) => peso[a.motivo] - peso[b.motivo] || a.name.localeCompare(b.name, 'pt-BR'));
  return base;
}

export type ReativacaoResultado =
  | { ok: true; reativados: number; ignorados: number; nomes: string[] }
  | { ok: false; reason: 'FORBIDDEN' | 'NOT_FOUND' | 'RH_ERROR' | 'INVALID'; detail?: string };

/**
 * Reativa SÓ quem a análise, refeita agora, classifica como inativado por
 * ausência — ids fora dessa classe são ignorados e contados. Só ADMIN. Não
 * mexe em vínculo de unidade, cargo, CPF nem matrícula: só `active`.
 */
export async function reativarInativadosPorAusencia(user: SessionUser, unitId: string, ids: string[], ctx: { ip?: string | null; userAgent?: string | null } = {}, api: RhApi = rh): Promise<ReativacaoResultado> {
  if (user.role !== 'ADMIN') return { ok: false, reason: 'FORBIDDEN' };
  const pedidos = [...new Set((ids ?? []).filter(Boolean))];
  if (pedidos.length === 0) return { ok: false, reason: 'INVALID', detail: 'Nenhum colaborador selecionado.' };
  const analise = await analisarInativos(user, unitId, api);
  if (!analise) return { ok: false, reason: 'NOT_FOUND' };
  if (analise.erro) return { ok: false, reason: 'RH_ERROR', detail: analise.erro };

  const elegiveis = analise.itens.filter((i) => i.motivo === 'INATIVADO_POR_AUSENCIA' && pedidos.includes(i.id));
  const ignorados = pedidos.length - elegiveis.length;
  if (elegiveis.length === 0) return { ok: true, reativados: 0, ignorados, nomes: [] };

  const r = await prisma.collaborator.updateMany({ where: { id: { in: elegiveis.map((e) => e.id) }, active: false }, data: { active: true } });
  await audit({
    userId: user.id, unitId, action: 'RH_REACTIVATE_ABSENT', module: 'PEOPLE', entity: 'collaborator',
    metadata: { reativados: r.count, ignorados, pessoas: elegiveis.map((e) => ({ id: e.id, matricula: e.externalId, nome: e.name, statusNoRh: e.statusNoRh })) },
    ...ctx,
  });
  return { ok: true, reativados: r.count, ignorados, nomes: elegiveis.map((e) => e.name) };
}
