import { prisma } from '@/lib/db/prisma';
import { canAccessUnit, unitScopeWhere } from '@/lib/scope/unit-scope';
import { ALL_ROLES, effectivePermissions, isFullAccess, permissoesEfetivasDoRequest } from '@/lib/permissions';
import { codigoDaVaga, type Papel, type StatusDaVaga } from '@/lib/vagas/regras';
import type { CurriculoDTO, EventoDTO, PosicaoDTO, VagaDTO } from '@/lib/vagas/tipos';
import type { SessionUser } from '@/lib/auth/session';
import type { Prisma, Role } from '@prisma/client';

/**
 * LEITURA das vagas (servidor). O alcance é o de sempre: escopo por unidade no
 * `where`, e as três permissões da matriz —
 *   VAGAS/ver = ver · VAGAS/editar = pedir, corrigir, anexar · VAGAS_APPROVE/editar = aprovar.
 */

export interface Permissoes { ver: boolean; pedir: boolean; aprovar: boolean }

export async function permissoesDeVagas(user: SessionUser): Promise<Permissoes> {
  if (isFullAccess(user.role)) return { ver: true, pedir: true, aprovar: true };
  const p = await permissoesEfetivasDoRequest(user.role);
  return { ver: Boolean(p.VAGAS?.canView), pedir: Boolean(p.VAGAS?.canEdit), aprovar: Boolean(p.VAGAS_APPROVE?.canEdit) };
}

/** O papel do usuário NESTA vaga: dono = pode pedir e alcança a unidade; aprovador = pode aprovar e alcança a unidade. */
export function papelNaVaga(user: SessionUser, perm: Permissoes, unitId: string): Papel {
  const alcanca = canAccessUnit(user, unitId);
  return { dono: perm.pedir && alcanca, aprovador: perm.aprovar && alcanca };
}

/** Os perfis que aprovam vagas hoje, pela matriz (sem Admin/CEO, que não têm vínculo de unidade). */
export async function perfisQueAprovam(): Promise<Role[]> {
  const out: Role[] = [];
  for (const r of ALL_ROLES) {
    if (isFullAccess(r)) continue;
    if ((await effectivePermissions(r)).VAGAS_APPROVE?.canEdit) out.push(r);
  }
  return out;
}

/** Quem aprova as vagas desta unidade (para avisar). */
export async function aprovadoresDaUnidade(unitId: string): Promise<string[]> {
  const roles = await perfisQueAprovam();
  if (roles.length === 0) return [];
  const us = await prisma.user.findMany({ where: { active: true, role: { in: roles }, memberships: { some: { unitId } } }, select: { id: true } });
  return us.map((u) => u.id);
}

const INCLUIR = {
  unit: { select: { name: true } },
  posicoes: { orderBy: { ordem: 'asc' as const } },
  curriculos: { orderBy: { enviadoEm: 'asc' as const } },
  eventos: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.VagaSolicitacaoInclude;
type Linha = Prisma.VagaSolicitacaoGetPayload<{ include: typeof INCLUIR }>;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function paraDTO(v: Linha): VagaDTO {
  /* Vaga antiga sem posições: a linha repetida `quantidade` vezes (senão o detalhe quebra). */
  const posicoes: PosicaoDTO[] = v.posicoes.length
    ? v.posicoes.map((p) => ({ ordem: p.ordem, cargo: p.cargo, motivo: p.motivo, substituiNome: p.substituiNome, substituiColaboradorId: p.substituiColaboradorId, escala: p.escala, horario: p.horario, inicioDesejado: p.inicioDesejado, requisitos: p.requisitos, observacao: p.observacao }))
    : Array.from({ length: Math.max(1, v.quantidade) }, (_, i) => ({ ordem: i + 1, cargo: v.cargoResumo, motivo: '', substituiNome: null, substituiColaboradorId: null, escala: '', horario: '', inicioDesejado: v.inicioDesejado, requisitos: v.requisitos, observacao: v.observacao }));
  const curriculos: CurriculoDTO[] = v.curriculos.map((c) => ({
    id: c.id, number: c.number, nomeArquivo: c.nomeArquivo, mime: c.mime, tamanho: c.tamanho, indicadoPor: c.indicadoPor,
    enviadoPorId: c.enviadoPorId, enviadoPorNome: c.enviadoPorNome, enviadoEm: c.enviadoEm.toISOString(), removido: Boolean(c.removidoEm),
    fluxo: c.fluxo, decididoPorNome: c.decididoPorNome, decididoEm: iso(c.decididoEm), motivoRecusa: c.motivoRecusa,
    rhEnvioSituacao: c.rhEnvioSituacao, rhEnvioMotivo: c.rhEnvioMotivo, rhSituacao: c.rhSituacao, rhSituacaoEm: iso(c.rhSituacaoEm), rhObservacao: c.rhObservacao,
  }));
  const eventos: EventoDTO[] = v.eventos.map((e) => ({ id: e.id, tipo: e.tipo, origem: e.origem, descricao: e.descricao, usuarioNome: e.usuarioNome, createdAt: e.createdAt.toISOString() }));
  return {
    id: v.id, number: v.number, codigo: codigoDaVaga(v.number), unitId: v.unitId, unitName: v.unit.name,
    cargoResumo: v.cargoResumo, quantidade: v.quantidade, requisitos: v.requisitos, observacao: v.observacao,
    inicioDesejado: v.inicioDesejado, prioridade: v.prioridade, status: v.status as StatusDaVaga,
    createdById: v.createdById, createdByName: v.createdByName, createdAt: v.createdAt.toISOString(),
    enviadoParaAprovacaoEm: v.enviadoParaAprovacaoEm.toISOString(),
    decididoPorNome: v.decididoPorNome, decididoEm: iso(v.decididoEm), motivoDevolucao: v.motivoDevolucao,
    canceladoPorNome: v.canceladoPorNome, canceladoEm: iso(v.canceladoEm), motivoCancelamento: v.motivoCancelamento,
    rhEnvioAcao: v.rhEnvioAcao, rhEnvioSituacao: v.rhEnvioSituacao, rhEnvioMotivo: v.rhEnvioMotivo, rhEnviadoEm: iso(v.rhEnviadoEm), rhChegouEm: iso(v.rhChegouEm),
    codigoRh: v.codigoRh, rhSituacao: v.rhSituacao, rhSituacaoEm: iso(v.rhSituacaoEm), rhCandidato: v.rhCandidato, rhObservacao: v.rhObservacao,
    posicoes, curriculos, eventos,
  };
}

export const LIMITE_DA_LISTA = 500;

/** As vagas do alcance do usuário (as excluídas ficam de fora), mais recentes primeiro. */
export async function listarVagas(user: SessionUser): Promise<VagaDTO[]> {
  const linhas = await prisma.vagaSolicitacao.findMany({
    where: { excluidaEm: null, ...unitScopeWhere(user, 'unitId') },
    include: INCLUIR,
    orderBy: { createdAt: 'desc' },
    take: LIMITE_DA_LISTA,
  });
  return linhas.map(paraDTO);
}

/** Uma vaga, se estiver no alcance do usuário. Excluída some também por URL. */
export async function getVaga(user: SessionUser, id: string): Promise<VagaDTO | null> {
  const v = await prisma.vagaSolicitacao.findFirst({ where: { id, excluidaEm: null, ...unitScopeWhere(user, 'unitId') }, include: INCLUIR });
  return v ? paraDTO(v) : null;
}

export async function carregarVaga(id: string) {
  return prisma.vagaSolicitacao.findUnique({ where: { id }, include: INCLUIR });
}

/* ───────────────────────── apoio do formulário ───────────────────────── */

export interface Apoio {
  /** As unidades em que o usuário pode pedir. Uma só = a tela nem mostra a escolha. */
  unidades: { id: string; name: string }[];
  cargos: string[];
  /** Por unidade: ativos + desligados há até 120 dias. */
  colaboradores: Record<string, { id: string; nome: string; cargo: string | null; ativo: boolean }[]>;
}

export const DIAS_DO_DESLIGADO = 120;

export async function apoioDoFormulario(user: SessionUser, hoje: string): Promise<Apoio> {
  const unidades = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const cargos = (await prisma.collaborator.findMany({ where: { jobTitle: { not: null } }, distinct: ['jobTitle'], select: { jobTitle: true }, orderBy: { jobTitle: 'asc' } }))
    .map((c) => (c.jobTitle ?? '').trim()).filter(Boolean);
  const corte = new Date(new Date(`${hoje}T12:00:00Z`).getTime() - DIAS_DO_DESLIGADO * 86_400_000).toISOString().slice(0, 10);
  const pessoas = await prisma.collaborator.findMany({
    where: { units: { some: { unitId: { in: unidades.map((u) => u.id) } } }, OR: [{ active: true }, { active: false, inactiveSince: { gte: corte } }] },
    select: { id: true, name: true, jobTitle: true, active: true, units: { select: { unitId: true } } },
    orderBy: { name: 'asc' },
  });
  const colaboradores: Apoio['colaboradores'] = {};
  for (const u of unidades) colaboradores[u.id] = [];
  for (const p of pessoas) for (const l of p.units) colaboradores[l.unitId]?.push({ id: p.id, nome: p.name, cargo: p.jobTitle, ativo: p.active });
  return { unidades, cargos: [...new Set(cargos)], colaboradores };
}
