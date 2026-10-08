import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { hojeNaOperacao } from '@/lib/controle-gerentes-dados';
import type { SessionUser } from '@/lib/auth/session';
import { lerRespostas, notaDaAvaliacao, type Classificacao } from '@/lib/people/avaliacao-calculo';
import { mesesEntre, montarPainel, type AvaliacaoDoPainel, type FiltroPainel, type Painel, type PlanoDoPainel } from '@/lib/people/avaliacao-painel-calculo';

/**
 * Painel gerencial da avaliação — leitura no servidor (v1.162.0). Escopo por
 * unidade SEMPRE no `where`; o filtro de unidade da URL é AND com o escopo.
 * Nada grava; Excel e PDF chamam esta mesma função.
 */
export interface PainelCompleto { painel: Painel; filtro: FiltroPainel; unidades: { id: string; name: string }[]; funcoes: string[]; avaliacoes: AvaliacaoDoPainel[] }

export async function getPainelAvaliacao(user: SessionUser, filtro: FiltroPainel, hoje = hojeNaOperacao()): Promise<PainelCompleto> {
  const meses = mesesEntre(filtro.de, filtro.ate);
  const unidades = await prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  /* Unidade fora do alcance é IGNORADA, não obedecida (o escopo é o das unidades acima). */
  const unidadeValida = !!filtro.unitId && unidades.some((u) => u.id === filtro.unitId);
  const unitIds = unidades.filter((u) => !unidadeValida || u.id === filtro.unitId).map((u) => u.id);
  const nomeDaUnidade = new Map(unidades.map((u) => [u.id, u.name]));

  const [rows, ativos, planos] = await Promise.all([
    prisma.collaboratorEvaluation.findMany({
      where: {
        unitId: { in: unitIds }, yearMonth: { gte: filtro.de, lte: filtro.ate },
        ...(filtro.colaborador ? { collaboratorName: { contains: filtro.colaborador, mode: 'insensitive' } } : {}),
      },
      orderBy: [{ yearMonth: 'asc' }, { collaboratorName: 'asc' }],
      select: {
        id: true, collaboratorId: true, collaboratorName: true, unitId: true, yearMonth: true, finalScore: true, classification: true, modelName: true, jobTitle: true,
        punctuality: true, performance: true, teamwork: true, presentation: true, scores: true, evaluatorName: true, reviewRequestedAt: true, reviewResolvedAt: true,
      },
    }),
    prisma.collaboratorUnit.groupBy({ by: ['unitId'], where: { unitId: { in: unitIds }, collaborator: { active: true } }, _count: { _all: true } }),
    prisma.developmentPlan.findMany({
      where: { unitId: { in: unitIds }, OR: [{ yearMonth: { gte: filtro.de, lte: filtro.ate } }, { status: { not: 'DONE' } }], ...(filtro.colaborador ? { collaboratorName: { contains: filtro.colaborador, mode: 'insensitive' } } : {}) },
      orderBy: { dueDate: 'asc' },
    }),
  ]);

  const todas: AvaliacaoDoPainel[] = rows.map((r) => ({
    id: r.id, collaboratorId: r.collaboratorId, collaboratorName: r.collaboratorName, unitId: r.unitId, unitName: nomeDaUnidade.get(r.unitId) ?? '—', yearMonth: r.yearMonth,
    nota: notaDaAvaliacao(r), classificacao: (r.classification as Classificacao | null) ?? null,
    funcao: r.modelName ?? r.jobTitle ?? 'Sem função', evaluatorName: r.evaluatorName,
    respostas: lerRespostas(r.scores).map((x) => ({ key: x.key, label: x.label, score: x.score })),
    revisaoAberta: !!r.reviewRequestedAt && !r.reviewResolvedAt,
  }));
  const funcoes = [...new Set(todas.map((a) => a.funcao))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const avaliacoes = filtro.funcao ? todas.filter((a) => a.funcao === filtro.funcao) : todas;
  const ativosPorUnidade = unidades.filter((u) => unitIds.includes(u.id)).map((u) => ({ unitId: u.id, unitName: u.name, ativos: ativos.find((a) => a.unitId === u.id)?._count._all ?? 0 }));
  const planosDoPainel: PlanoDoPainel[] = planos.map((p) => ({
    id: p.id, collaboratorId: p.collaboratorId, collaboratorName: p.collaboratorName, unitId: p.unitId, unitName: nomeDaUnidade.get(p.unitId) ?? '—', yearMonth: p.yearMonth,
    criterionLabel: p.criterionLabel, action: p.action, responsibleName: p.responsibleName, dueDate: p.dueDate.toISOString().slice(0, 10), status: p.status, completedAt: p.completedAt?.toISOString() ?? null,
  }));

  return { painel: montarPainel(avaliacoes, ativosPorUnidade, planosDoPainel, meses, hoje), filtro, unidades, funcoes, avaliacoes };
}
