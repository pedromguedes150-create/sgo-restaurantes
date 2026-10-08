import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { notifyAdmins } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';
import {
  MODELOS_INICIAIS, assinaturaDosCriterios, lerCriterios, montarCriterios, normalizarCargo,
  type Criterio,
} from '@/lib/people/avaliacao-calculo';

/**
 * MODELOS DE AVALIAÇÃO POR FUNÇÃO — servidor (v1.161.0).
 *
 * O cargo chega do RH (`Collaborator.jobTitle`); aqui ele é casado NORMALIZADO
 * com um modelo (`EvaluationModelJobTitle.jobTitleKey`). Cada edição de
 * critério/peso cria uma VERSÃO nova e imutável; a avaliação guarda a versão
 * usada, então mudar peso hoje não reescreve a nota de ontem.
 *
 * Só ADMIN e CEO configuram (`podeConfigurarAvaliacao`). Cargo sem modelo
 * NÃO ganha modelo por adivinhação: aparece em "funções sem modelo" para o
 * Admin vincular (decisão do Pedro, 08/10/2026).
 */

export const podeConfigurarAvaliacao = (role: string) => role === 'ADMIN' || role === 'CEO';

type Ctx = { ip?: string | null; userAgent?: string | null };
export type ResultadoModelo = { ok: true; id: string } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND'; detalhe?: string };

export interface ModeloResumo {
  id: string; name: string; managerial: boolean; active: boolean; seedKey: string | null;
  versao: { id: string; version: number; criterios: Criterio[] } | null;
  cargos: { jobTitle: string; jobTitleKey: string; colaboradores: number }[];
  avaliacoes: number;
}

/** Versão vigente = a de maior número. */
async function versaoVigente(modelId: string) {
  return prisma.evaluationModelVersion.findFirst({ where: { modelId }, orderBy: { version: 'desc' } });
}

/**
 * Semeia os 10 modelos da especificação — IDEMPOTENTE (`seedKey` único; cargo
 * já vinculado a QUALQUER modelo não é tocado). Roda ao abrir as telas; nunca
 * sobrescreve edição do Admin.
 */
export async function ensureModelosIniciais(): Promise<void> {
  const existentes = new Set((await prisma.evaluationModel.findMany({ where: { seedKey: { not: null } }, select: { seedKey: true } })).map((m) => m.seedKey));
  if (existentes.size === MODELOS_INICIAIS.length) return;
  for (const m of MODELOS_INICIAIS) {
    if (existentes.has(m.seedKey)) continue;
    const montado = montarCriterios(m.especificos);
    if (!montado.ok) continue;
    const criado = await prisma.evaluationModel.create({
      data: { name: m.name, managerial: !!m.managerial, seedKey: m.seedKey, versions: { create: { version: 1, criteria: montado.criterios as object[] } } },
    });
    for (const cargo of m.cargos) {
      const key = normalizarCargo(cargo);
      if (!key) continue;
      const ja = await prisma.evaluationModelJobTitle.findUnique({ where: { jobTitleKey: key } });
      if (ja) continue;
      await prisma.evaluationModelJobTitle.create({ data: { modelId: criado.id, jobTitle: cargo, jobTitleKey: key } });
    }
  }
}

/** Cargos distintos dos colaboradores ATIVOS do RH, com quantos têm cada um. */
export async function cargosDoRh(): Promise<{ jobTitle: string; jobTitleKey: string; colaboradores: number }[]> {
  const grupos = await prisma.collaborator.groupBy({ by: ['jobTitle'], where: { active: true, jobTitle: { not: null } }, _count: { _all: true } });
  const porChave = new Map<string, { jobTitle: string; jobTitleKey: string; colaboradores: number }>();
  for (const g of grupos) {
    const key = normalizarCargo(g.jobTitle);
    if (!key) continue;
    const atual = porChave.get(key);
    if (atual) atual.colaboradores += g._count._all;
    else porChave.set(key, { jobTitle: (g.jobTitle ?? '').trim(), jobTitleKey: key, colaboradores: g._count._all });
  }
  return [...porChave.values()].sort((a, b) => b.colaboradores - a.colaboradores || a.jobTitle.localeCompare(b.jobTitle, 'pt-BR'));
}

export async function listarModelos(): Promise<ModeloResumo[]> {
  const [modelos, cargos, contagens] = await Promise.all([
    prisma.evaluationModel.findMany({ orderBy: [{ managerial: 'asc' }, { name: 'asc' }], include: { jobTitles: true, versions: { orderBy: { version: 'desc' }, take: 1 } } }),
    cargosDoRh(),
    prisma.collaboratorEvaluation.groupBy({ by: ['modelId'], where: { modelId: { not: null } }, _count: { _all: true } }),
  ]);
  const colabsPorChave = new Map(cargos.map((c) => [c.jobTitleKey, c.colaboradores]));
  const avaliacoesPor = new Map(contagens.map((c) => [c.modelId, c._count._all]));
  return modelos.map((m) => ({
    id: m.id, name: m.name, managerial: m.managerial, active: m.active, seedKey: m.seedKey,
    versao: m.versions[0] ? { id: m.versions[0].id, version: m.versions[0].version, criterios: lerCriterios(m.versions[0].criteria) } : null,
    cargos: m.jobTitles.map((j) => ({ jobTitle: j.jobTitle, jobTitleKey: j.jobTitleKey, colaboradores: colabsPorChave.get(j.jobTitleKey) ?? 0 })).sort((a, b) => a.jobTitle.localeCompare(b.jobTitle, 'pt-BR')),
    avaliacoes: avaliacoesPor.get(m.id) ?? 0,
  }));
}

/** Cargos do RH que ainda não apontam para modelo ATIVO (com quantos colaboradores) + quantos estão sem cargo. */
export async function funcoesSemModelo(): Promise<{ cargos: { jobTitle: string; jobTitleKey: string; colaboradores: number; modeloInativo: string | null }[]; semCargo: number }> {
  const [cargos, vinculos, semCargo] = await Promise.all([
    cargosDoRh(),
    prisma.evaluationModelJobTitle.findMany({ select: { jobTitleKey: true, model: { select: { active: true, name: true } } } }),
    prisma.collaborator.count({ where: { active: true, OR: [{ jobTitle: null }, { jobTitle: '' }] } }),
  ]);
  const porChave = new Map(vinculos.map((v) => [v.jobTitleKey, v.model]));
  const faltam = cargos
    .filter((c) => !porChave.get(c.jobTitleKey)?.active)
    .map((c) => ({ ...c, modeloInativo: porChave.get(c.jobTitleKey)?.name ?? null }));
  return { cargos: faltam, semCargo };
}

/** Modelo + versão vigente de um cargo (só modelo ATIVO conta). */
export async function modeloParaCargo(jobTitle: string | null | undefined) {
  const key = normalizarCargo(jobTitle);
  if (!key) return null;
  const v = await prisma.evaluationModelJobTitle.findUnique({ where: { jobTitleKey: key }, include: { model: { include: { versions: { orderBy: { version: 'desc' }, take: 1 } } } } });
  if (!v || !v.model.active || !v.model.versions[0]) return null;
  return { id: v.model.id, name: v.model.name, managerial: v.model.managerial, versionId: v.model.versions[0].id, version: v.model.versions[0].version, criterios: lerCriterios(v.model.versions[0].criteria) };
}

export interface EntradaModelo { name: string; managerial?: boolean; especificos: { label: string; weight: number; key?: string }[]; cargos?: string[] }

export async function criarModelo(user: SessionUser, input: EntradaModelo, ctx: Ctx = {}): Promise<ResultadoModelo> {
  if (!podeConfigurarAvaliacao(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const name = (input.name ?? '').trim();
  if (!name || name.length > 80) return { ok: false, reason: 'INVALID', detalhe: 'Dê um nome ao modelo (até 80 letras).' };
  const montado = montarCriterios(input.especificos ?? []);
  if (!montado.ok) return { ok: false, reason: 'INVALID', detalhe: montado.erro };
  const m = await prisma.evaluationModel.create({
    data: { name, managerial: !!input.managerial, versions: { create: { version: 1, criteria: montado.criterios as object[], createdById: user.id, createdByName: user.name } } },
  });
  await audit({ userId: user.id, action: 'EVALUATION_MODEL_CREATE', module: 'CONFIG', entity: 'evaluation_model', entityId: m.id, metadata: { name, managerial: !!input.managerial, criterios: montado.criterios }, ...ctx });
  if (input.cargos?.length) await vincularCargos(user, m.id, input.cargos, ctx);
  return { ok: true, id: m.id };
}

/**
 * Edita nome/gerencial/ativo sem versão nova; critérios ou pesos DIFERENTES
 * criam a versão seguinte (as avaliações já gravadas seguem presas à antiga).
 */
export async function editarModelo(user: SessionUser, id: string, input: Partial<EntradaModelo> & { active?: boolean }, ctx: Ctx = {}): Promise<ResultadoModelo & { novaVersao?: number }> {
  if (!podeConfigurarAvaliacao(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const m = await prisma.evaluationModel.findUnique({ where: { id } });
  if (!m) return { ok: false, reason: 'NOT_FOUND' };
  const data: { name?: string; managerial?: boolean; active?: boolean } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name || name.length > 80) return { ok: false, reason: 'INVALID', detalhe: 'Dê um nome ao modelo (até 80 letras).' };
    data.name = name;
  }
  if (input.managerial !== undefined) data.managerial = !!input.managerial;
  if (input.active !== undefined) data.active = !!input.active;

  let novaVersao: number | undefined;
  if (input.especificos) {
    const montado = montarCriterios(input.especificos);
    if (!montado.ok) return { ok: false, reason: 'INVALID', detalhe: montado.erro };
    const atual = await versaoVigente(id);
    if (!atual || assinaturaDosCriterios(lerCriterios(atual.criteria)) !== assinaturaDosCriterios(montado.criterios)) {
      novaVersao = (atual?.version ?? 0) + 1;
      await prisma.evaluationModelVersion.create({ data: { modelId: id, version: novaVersao, criteria: montado.criterios as object[], createdById: user.id, createdByName: user.name } });
    }
  }
  if (Object.keys(data).length) await prisma.evaluationModel.update({ where: { id }, data });
  await audit({ userId: user.id, action: 'EVALUATION_MODEL_UPDATE', module: 'CONFIG', entity: 'evaluation_model', entityId: id, metadata: { antes: { name: m.name, managerial: m.managerial, active: m.active }, depois: data, novaVersao: novaVersao ?? null }, ...ctx });
  return { ok: true, id, novaVersao };
}

/**
 * Substitui o conjunto de cargos do modelo. Cargo que estava em OUTRO modelo
 * passa para este (é a "correção de vínculo" do Admin); a resposta nomeia os
 * que mudaram de modelo, para não ser silencioso.
 */
export async function vincularCargos(user: SessionUser, modelId: string, cargos: string[], ctx: Ctx = {}): Promise<ResultadoModelo & { movidos?: string[] }> {
  if (!podeConfigurarAvaliacao(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const m = await prisma.evaluationModel.findUnique({ where: { id: modelId }, select: { name: true } });
  if (!m) return { ok: false, reason: 'NOT_FOUND' };
  const limpos = new Map<string, string>();
  for (const c of cargos) {
    const key = normalizarCargo(c);
    if (key) limpos.set(key, c.trim());
  }
  const movidos: string[] = [];
  await prisma.$transaction(async (tx) => {
    await tx.evaluationModelJobTitle.deleteMany({ where: { modelId, jobTitleKey: { notIn: [...limpos.keys()] } } });
    for (const [key, jobTitle] of limpos) {
      const ja = await tx.evaluationModelJobTitle.findUnique({ where: { jobTitleKey: key }, select: { modelId: true } });
      if (ja && ja.modelId !== modelId) movidos.push(jobTitle);
      await tx.evaluationModelJobTitle.upsert({ where: { jobTitleKey: key }, create: { modelId, jobTitle, jobTitleKey: key }, update: { modelId, jobTitle } });
    }
  });
  await audit({ userId: user.id, action: 'EVALUATION_MODEL_JOBTITLES', module: 'CONFIG', entity: 'evaluation_model', entityId: modelId, metadata: { modelo: m.name, cargos: [...limpos.values()], movidos }, ...ctx });
  return { ok: true, id: modelId, movidos };
}

/**
 * Avisa os Admins das funções sem modelo — no máximo 1× por dia (AppSetting),
 * chamado ao abrir a tela de avaliação. Sem isso a pendência só apareceria
 * para quem entrasse em Configurações.
 */
export async function avisarFuncoesSemModelo(): Promise<number> {
  const { cargos } = await funcoesSemModelo();
  if (cargos.length === 0) return 0;
  const hoje = new Date().toISOString().slice(0, 10);
  const KEY = 'EVALUATION_UNMAPPED_NOTIFIED';
  const s = await prisma.appSetting.findUnique({ where: { key: KEY } });
  if (s?.value === hoje) return cargos.length;
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: hoje }, update: { value: hoje } });
  const nomes = cargos.slice(0, 5).map((c) => c.jobTitle).join(', ');
  await notifyAdmins({
    title: `Avaliação: ${cargos.length} função(ões) do RH sem modelo`,
    body: `${nomes}${cargos.length > 5 ? '…' : ''}. Vincule em Configurações → Avaliação por função para a equipe poder ser avaliada.`,
    link: '/configuracoes/avaliacao',
    module: 'PEOPLE',
  });
  return cargos.length;
}
