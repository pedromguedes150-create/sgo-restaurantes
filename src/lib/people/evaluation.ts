import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere, canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { modeloParaCargo } from '@/lib/people/avaliacao-modelos';
import {
  calcularNota, lerCriterios, lerRespostas, normalizarCargo, notaDaAvaliacao, quemPodeAvaliar, validarRespostas,
  type Classificacao, type Criterio, type MotivoSemAvaliar, type Resposta, type RespostaGravada,
} from '@/lib/people/avaliacao-calculo';

/**
 * Avaliação do colaborador (item 13, Onda 3; reformulada na v1.161.0):
 *  - Observações do dia a dia (texto livre, não altera o cadastro do RH).
 *  - Avaliação mensal (1 por colaborador/mês) pelo MODELO DA FUNÇÃO: 8
 *    critérios com peso, N/A justificado, nota ponderada congelada com a
 *    versão do modelo. As avaliações antigas (4 critérios) ficam como estão.
 * Conta na META como componente único "Avaliações da equipe" com peso
 * configurável (EVALUATION_META_WEIGHT, padrão 0 = desligado — decisão do
 * Pedro em 07/07: só entra na nota quando o Admin ligar em Config).
 */
const WEIGHT_KEY = 'EVALUATION_META_WEIGHT';
const DEFAULT_WEIGHT = 0;

type Ctx = { ip?: string | null; userAgent?: string | null };
type Result = { ok: true } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' | 'SEM_MODELO' | 'GERENCIAL' | 'PROPRIO'; erros?: string[] };

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function limitesDoMes(yearMonth: string): { inicio: Date; fim: Date } {
  const [y, m] = yearMonth.split('-').map(Number);
  return { inicio: new Date(Date.UTC(y, m - 1, 1)), fim: new Date(Date.UTC(y, m, 1)) };
}

// ===== Peso na meta ==========================================================

export async function getEvaluationWeight(): Promise<number> {
  const s = await prisma.appSetting.findUnique({ where: { key: WEIGHT_KEY } });
  const n = s ? Number(s.value) : DEFAULT_WEIGHT;
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : DEFAULT_WEIGHT;
}

export async function setEvaluationWeight(user: SessionUser, weight: number) {
  if (user.role !== 'ADMIN') return { ok: false as const, reason: 'FORBIDDEN' as const };
  const w = Math.max(0, Math.trunc(weight));
  if (!Number.isFinite(w)) return { ok: false as const, reason: 'INVALID' as const };
  await prisma.appSetting.upsert({ where: { key: WEIGHT_KEY }, create: { key: WEIGHT_KEY, value: String(w) }, update: { value: String(w) } });
  await audit({ userId: user.id, action: 'EVALUATION_WEIGHT_SET', module: 'CONFIG', metadata: { weight: w } });
  return { ok: true as const };
}

/**
 * Estatística do mês para a META: done = colaboradores avaliados,
 * missed = ativos sem avaliação — só penaliza em MESES JÁ ENCERRADOS
 * (durante o mês corrente ainda dá tempo de avaliar).
 */
export async function getEvaluationMonthStats(unitId: string, yearMonth: string): Promise<{ done: number; missed: number }> {
  const done = await prisma.collaboratorEvaluation.count({ where: { unitId, yearMonth } });
  if (yearMonth >= currentYearMonth()) return { done, missed: 0 };
  const active = await prisma.collaboratorUnit.count({ where: { unitId, collaborator: { active: true } } });
  return { done, missed: Math.max(0, active - done) };
}

// ===== Quadro de avaliação ===================================================

export interface AvaliacaoGravada {
  id: string;
  nota: number | null;
  classificacao: Classificacao | null;
  /** Respostas por critério (formato por função). Vazio nas avaliações antigas. */
  respostas: RespostaGravada[];
  /** Avaliação no formato anterior à v1.161.0 (4 critérios sem peso). */
  legado: { punctuality: number; performance: number; teamwork: number; presentation: number } | null;
  modelName: string | null;
  modelVersion: number | null;
  comments: string | null;
  evaluatorName: string;
  updatedAt: string;
  /** Revisão pedida pela Supervisão (v1.162.0): aberta até o avaliador salvar de novo. */
  revisao: { porNome: string; em: string; motivo: string; resolvidaEm: string | null } | null;
}

export interface EvaluationRow {
  collaboratorId: string;
  name: string;
  jobTitle: string | null;
  unitId: string;
  unitName: string;
  observationCount: number;
  /** Modelo da função (vigente). null = função sem modelo. */
  modelo: { id: string; name: string; managerial: boolean; versionId: string; version: number; criterios: Criterio[] } | null;
  /** Se este usuário pode avaliar esta pessoa, e por que não. */
  permissao: { pode: boolean; motivo: MotivoSemAvaliar | null };
  /** Férias cobrindo algum dia do mês (segue ativo; o avaliador leva em conta). */
  ferias: boolean;
  evaluation: AvaliacaoGravada | null;
  /** A avaliação mais recente ANTES do mês pedido, por critério — base da evolução do plano de desenvolvimento. */
  anterior: { yearMonth: string; nota: number | null; scores: Record<string, number | null> } | null;
  /** Planos de desenvolvimento em aberto (não concluídos) e quantos venceram. */
  planos: { abertos: number; vencidos: number };
}

function montarGravada(e: {
  id: string;
  punctuality: number | null; performance: number | null; teamwork: number | null; presentation: number | null;
  finalScore: number | null; classification: string | null; scores: unknown; modelName: string | null;
  comments: string | null; evaluatorName: string; updatedAt: Date; modelVersion?: { version: number } | null;
  reviewRequestedByName?: string | null; reviewRequestedAt?: Date | null; reviewReason?: string | null; reviewResolvedAt?: Date | null;
}): AvaliacaoGravada {
  const legado = e.finalScore == null && e.punctuality != null && e.performance != null && e.teamwork != null && e.presentation != null
    ? { punctuality: e.punctuality, performance: e.performance, teamwork: e.teamwork, presentation: e.presentation }
    : null;
  return {
    id: e.id,
    nota: notaDaAvaliacao(e),
    classificacao: (e.classification as Classificacao | null) ?? null,
    respostas: lerRespostas(e.scores),
    legado,
    modelName: e.modelName,
    modelVersion: e.modelVersion?.version ?? null,
    comments: e.comments,
    evaluatorName: e.evaluatorName,
    updatedAt: e.updatedAt.toISOString(),
    revisao: e.reviewRequestedAt
      ? { porNome: e.reviewRequestedByName ?? '—', em: e.reviewRequestedAt.toISOString(), motivo: e.reviewReason ?? '', resolvidaEm: e.reviewResolvedAt?.toISOString() ?? null }
      : null,
  };
}

/** Colaboradores ativos do escopo do usuário com a avaliação do mês pedido. */
export async function listEvaluationBoard(user: SessionUser, yearMonth: string): Promise<EvaluationRow[]> {
  const { inicio, fim } = limitesDoMes(yearMonth);
  const [collabs, vinculos, modelos, eu] = await Promise.all([
    prisma.collaborator.findMany({
      where: { active: true, units: { some: { ...unitScopeWhere(user, 'unitId') } } },
      include: {
        units: { select: { unitId: true, unit: { select: { name: true } } } },
        vacations: { where: { status: { in: ['CONFIRMED', 'APPROVED', 'CHANGE_REQUESTED'] }, startDate: { lt: fim }, endDate: { gte: inicio } }, select: { id: true }, take: 1 },
      },
      orderBy: { name: 'asc' },
      take: 500,
    }),
    prisma.evaluationModelJobTitle.findMany({ select: { jobTitleKey: true, modelId: true } }),
    prisma.evaluationModel.findMany({ where: { active: true }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } } }),
    prisma.user.findUnique({ where: { id: user.id }, select: { cpf: true } }),
  ]);
  const ids = collabs.map((c) => c.id);
  const [evals, obsCounts, anteriores, planosAbertos] = await Promise.all([
    prisma.collaboratorEvaluation.findMany({ where: { collaboratorId: { in: ids }, yearMonth }, include: { modelVersion: { select: { version: true } } } }),
    prisma.collaboratorObservation.groupBy({ by: ['collaboratorId'], where: { collaboratorId: { in: ids } }, _count: true }),
    /* a mais recente ANTES do mês: uma por colaborador */
    prisma.collaboratorEvaluation.findMany({ where: { collaboratorId: { in: ids }, yearMonth: { lt: yearMonth } }, orderBy: [{ collaboratorId: 'asc' }, { yearMonth: 'desc' }], distinct: ['collaboratorId'], select: { collaboratorId: true, yearMonth: true, finalScore: true, punctuality: true, performance: true, teamwork: true, presentation: true, scores: true } }),
    prisma.developmentPlan.findMany({ where: { collaboratorId: { in: ids }, status: { not: 'DONE' } }, select: { collaboratorId: true, dueDate: true } }),
  ]);
  const evalBy = new Map(evals.map((e) => [e.collaboratorId, e]));
  const obsBy = new Map(obsCounts.map((o) => [o.collaboratorId, o._count]));
  const anteriorBy = new Map(anteriores.map((a) => [a.collaboratorId, a]));
  const hojeIso = new Date().toISOString().slice(0, 10);
  const planosBy = new Map<string, { abertos: number; vencidos: number }>();
  for (const p of planosAbertos) {
    const atual = planosBy.get(p.collaboratorId) ?? { abertos: 0, vencidos: 0 };
    atual.abertos++;
    if (p.dueDate.toISOString().slice(0, 10) < hojeIso) atual.vencidos++;
    planosBy.set(p.collaboratorId, atual);
  }
  const modeloPorCargo = new Map(vinculos.map((v) => [v.jobTitleKey, v.modelId]));
  const modeloPorId = new Map(modelos.map((m) => [m.id, m]));

  return collabs.map((c) => {
    const first = c.units.find((u) => canAccessUnit(user, u.unitId)) ?? c.units[0];
    const e = evalBy.get(c.id);
    const mid = modeloPorCargo.get(normalizarCargo(c.jobTitle));
    const m = mid ? modeloPorId.get(mid) : undefined;
    const modelo = m && m.versions[0]
      ? { id: m.id, name: m.name, managerial: m.managerial, versionId: m.versions[0].id, version: m.versions[0].version, criterios: lerCriterios(m.versions[0].criteria) }
      : null;
    return {
      collaboratorId: c.id,
      name: c.name,
      jobTitle: c.jobTitle,
      unitId: first?.unitId ?? '',
      unitName: c.units.map((u) => u.unit.name).join(', ') || '—',
      observationCount: obsBy.get(c.id) ?? 0,
      modelo,
      permissao: quemPodeAvaliar({ role: user.role, managerial: modelo?.managerial ?? false, semModelo: !modelo, cpfUsuario: eu?.cpf ?? null, cpfColaborador: c.cpf }),
      ferias: c.vacations.length > 0,
      evaluation: e ? montarGravada(e) : null,
      anterior: (() => {
        const a = anteriorBy.get(c.id);
        if (!a) return null;
        const scores: Record<string, number | null> = {};
        for (const r of lerRespostas(a.scores)) scores[r.key] = r.score;
        return { yearMonth: a.yearMonth, nota: notaDaAvaliacao(a), scores };
      })(),
      planos: planosBy.get(c.id) ?? { abertos: 0, vencidos: 0 },
    };
  });
}

/** Histórico de avaliações de um colaborador (últimos 12 meses com registro), nos dois formatos. */
export async function listEvaluationHistory(user: SessionUser, collaboratorId: string): Promise<(AvaliacaoGravada & { yearMonth: string })[]> {
  const collab = await prisma.collaborator.findUnique({ where: { id: collaboratorId }, select: { units: { select: { unitId: true } } } });
  if (!collab || !collab.units.some((u) => canAccessUnit(user, u.unitId))) return [];
  const rows = await prisma.collaboratorEvaluation.findMany({
    where: { collaboratorId },
    orderBy: { yearMonth: 'desc' },
    take: 12,
    include: { modelVersion: { select: { version: true } } },
  });
  return rows.map((e) => ({ yearMonth: e.yearMonth, ...montarGravada(e) }));
}

/**
 * Salva/atualiza a avaliação mensal (upsert por colaborador+mês) pelo modelo
 * da FUNÇÃO do colaborador. A nota e a versão do modelo ficam CONGELADAS na
 * linha; quem pode avaliar quem segue `quemPodeAvaliar` (a mesma regra da
 * tela). Função sem modelo → SEM_MODELO; nada é adivinhado.
 */
export async function saveEvaluation(
  user: SessionUser,
  collaboratorId: string,
  yearMonth: string,
  input: { respostas: Resposta[]; comments?: string },
  ctx: Ctx = {},
): Promise<Result> {
  if (!/^\d{4}-\d{2}$/.test(yearMonth) || yearMonth > currentYearMonth()) return { ok: false, reason: 'INVALID' };
  const collab = await prisma.collaborator.findUnique({ where: { id: collaboratorId }, select: { name: true, cpf: true, jobTitle: true, units: { select: { unitId: true } } } });
  if (!collab) return { ok: false, reason: 'NOT_FOUND' };
  const unitId = collab.units.find((u) => canAccessUnit(user, u.unitId))?.unitId;
  if (!unitId) return { ok: false, reason: 'FORBIDDEN' };

  const modelo = await modeloParaCargo(collab.jobTitle);
  const eu = await prisma.user.findUnique({ where: { id: user.id }, select: { cpf: true } });
  const perm = quemPodeAvaliar({ role: user.role, managerial: modelo?.managerial ?? false, semModelo: !modelo, cpfUsuario: eu?.cpf ?? null, cpfColaborador: collab.cpf });
  if (!perm.pode) {
    if (perm.motivo === 'SEM_MODELO') return { ok: false, reason: 'SEM_MODELO' };
    if (perm.motivo === 'GERENCIAL') return { ok: false, reason: 'GERENCIAL' };
    if (perm.motivo === 'PROPRIO') return { ok: false, reason: 'PROPRIO' };
    return { ok: false, reason: 'FORBIDDEN' };
  }
  if (!modelo) return { ok: false, reason: 'SEM_MODELO' };

  const validado = validarRespostas(modelo.criterios, Array.isArray(input.respostas) ? input.respostas : []);
  if (!validado.ok) return { ok: false, reason: 'INVALID', erros: validado.erros };
  const { nota, classificacao } = calcularNota(modelo.criterios, validado.gravar);
  if (nota == null || !classificacao) return { ok: false, reason: 'INVALID', erros: ['Todos os critérios estão N/A — não há o que avaliar.'] };
  const comments = (input.comments ?? '').trim().slice(0, 2000) || null;

  const anterior = await prisma.collaboratorEvaluation.findUnique({ where: { collaboratorId_yearMonth: { collaboratorId, yearMonth } }, select: { finalScore: true, classification: true, punctuality: true, performance: true, teamwork: true, presentation: true, evaluatorName: true, reviewRequestedAt: true, reviewResolvedAt: true } });
  /* Revisão aberta pela Supervisão: salvar de novo é o que a resolve (v1.162.0). */
  const revisaoAberta = !!anterior?.reviewRequestedAt && !anterior.reviewResolvedAt;
  const dados = {
    modelId: modelo.id, modelVersionId: modelo.versionId, modelName: modelo.name, jobTitle: collab.jobTitle,
    scores: validado.gravar as object[], finalScore: nota, classification: classificacao,
    /* Formato antigo fica nulo na avaliação nova — a nota mora em finalScore. */
    punctuality: null, performance: null, teamwork: null, presentation: null,
    comments, evaluatorId: user.id, evaluatorName: user.name,
    ...(revisaoAberta ? { reviewResolvedAt: new Date() } : {}),
  };
  await prisma.collaboratorEvaluation.upsert({
    where: { collaboratorId_yearMonth: { collaboratorId, yearMonth } },
    create: { collaboratorId, collaboratorName: collab.name, unitId, yearMonth, ...dados },
    update: dados,
  });
  await audit({
    userId: user.id, unitId, action: 'EVALUATION_SAVED', module: 'PEOPLE', entity: 'collaborator_evaluation',
    entityId: collaboratorId,
    metadata: {
      name: collab.name, yearMonth, modelo: modelo.name, versao: modelo.version, nota, classificacao,
      respostas: validado.gravar.map((r) => ({ key: r.key, score: r.score, justification: r.justification })),
      antes: anterior ? { nota: notaDaAvaliacao(anterior), classificacao: anterior.classification, avaliador: anterior.evaluatorName } : null,
      revisaoResolvida: revisaoAberta,
    },
    ...ctx,
  });
  return { ok: true };
}

// ===== Evidências de apoio ao avaliador =======================================

export interface EvidenciasDoMes {
  yearMonth: string;
  escala: { trabalhou: number; folgas: number; faltasInjustificadas: number; faltasJustificadas: number; atrasos: number; ferias: number } | null;
  setor: string | null;
  treinamentos: { concluidos: number; pendentes: number; atrasados: number };
  checklists: number;
  observacoes: { text: string; authorName: string; createdAt: string }[];
}

/**
 * O que o SGO já sabe do colaborador no mês, para APOIAR o avaliador — nunca
 * para descontar nota. Atestado NÃO entra (decisão da especificação: não é
 * critério de penalização); ocorrência e desperdício não têm vínculo
 * individual confiável, então ficam fora.
 */
export async function evidenciasDoMes(user: SessionUser, collaboratorId: string, yearMonth: string): Promise<EvidenciasDoMes | null> {
  const collab = await prisma.collaborator.findUnique({ where: { id: collaboratorId }, select: { units: { select: { unitId: true } } } });
  if (!collab || !collab.units.some((u) => canAccessUnit(user, u.unitId))) return null;
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return null;
  const { inicio, fim } = limitesDoMes(yearMonth);
  const [atuais, alocacao, treinos, checklists, obs] = await Promise.all([
    prisma.scheduleActual.groupBy({ by: ['status'], where: { collaboratorId, date: { gte: inicio, lt: fim } }, _count: { _all: true } }),
    prisma.workforceAllocation.findFirst({ where: { collaboratorId }, orderBy: { createdAt: 'desc' }, select: { sector: { select: { name: true } } } }),
    prisma.trainingRecord.findMany({ where: { collaboratorId, OR: [{ completedAt: { gte: inicio, lt: fim } }, { status: 'PENDING' }] }, select: { status: true, completedAt: true, dueDate: true } }),
    prisma.checklistSubmission.count({ where: { collaboratorId, createdAt: { gte: inicio, lt: fim } } }),
    prisma.collaboratorObservation.findMany({ where: { collaboratorId, createdAt: { gte: inicio, lt: fim } }, orderBy: { createdAt: 'desc' }, take: 10, select: { text: true, authorName: true, createdAt: true } }),
  ]);
  const n = (s: string) => atuais.find((a) => a.status === s)?._count._all ?? 0;
  const agora = new Date();
  return {
    yearMonth,
    escala: atuais.length ? { trabalhou: n('WORK') + n('ATRASO'), folgas: n('OFF'), faltasInjustificadas: n('FALTA_INJUST'), faltasJustificadas: n('FALTA_JUST'), atrasos: n('ATRASO'), ferias: n('FERIAS') } : null,
    setor: alocacao?.sector?.name ?? null,
    treinamentos: {
      concluidos: treinos.filter((t) => t.status === 'DONE' && t.completedAt && t.completedAt >= inicio && t.completedAt < fim).length,
      pendentes: treinos.filter((t) => t.status === 'PENDING' && t.dueDate >= agora).length,
      atrasados: treinos.filter((t) => t.status === 'PENDING' && t.dueDate < agora).length,
    },
    checklists,
    observacoes: obs.map((o) => ({ text: o.text, authorName: o.authorName, createdAt: o.createdAt.toISOString() })),
  };
}

// ===== Observações do dia a dia =============================================

export async function listObservations(user: SessionUser, collaboratorId: string) {
  const collab = await prisma.collaborator.findUnique({ where: { id: collaboratorId }, select: { units: { select: { unitId: true } } } });
  if (!collab || !collab.units.some((u) => canAccessUnit(user, u.unitId))) return [];
  return prisma.collaboratorObservation.findMany({
    where: { collaboratorId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

export async function addObservation(user: SessionUser, collaboratorId: string, text: string, ctx: Ctx = {}): Promise<Result> {
  if (user.role === 'FINANCE') return { ok: false, reason: 'FORBIDDEN' };
  const t = text?.trim();
  if (!t || t.length > 2000) return { ok: false, reason: 'INVALID' };
  const collab = await prisma.collaborator.findUnique({ where: { id: collaboratorId }, select: { name: true, units: { select: { unitId: true } } } });
  if (!collab) return { ok: false, reason: 'NOT_FOUND' };
  const unitId = collab.units.find((u) => canAccessUnit(user, u.unitId))?.unitId;
  if (!unitId) return { ok: false, reason: 'FORBIDDEN' };

  await prisma.collaboratorObservation.create({
    data: { collaboratorId, collaboratorName: collab.name, unitId, text: t, authorId: user.id, authorName: user.name },
  });
  await audit({
    userId: user.id, unitId, action: 'OBSERVATION_ADDED', module: 'PEOPLE', entity: 'collaborator_observation',
    entityId: collaboratorId, metadata: { name: collab.name }, ...ctx,
  });
  return { ok: true };
}
