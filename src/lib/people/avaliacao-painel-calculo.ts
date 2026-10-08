import { NOTA_BAIXA, ROTULO_CLASSIFICACAO, type Classificacao } from '@/lib/people/avaliacao-calculo';

/**
 * PAINEL GERENCIAL DA AVALIAÇÃO + PLANO DE DESENVOLVIMENTO — regras PURAS
 * (v1.162.0). Tudo aqui é composição das avaliações já gravadas: nenhum
 * número é recalculado a partir dos pesos — a nota usada é a `finalScore`
 * congelada (ou a média dos 4, nas antigas). Tela, Excel e PDF chamam as
 * mesmas funções.
 */

export interface FiltroPainel { de: string; ate: string; unitId: string | null; funcao: string | null; colaborador: string | null }

const YM = /^\d{4}-\d{2}$/;
export function mesesEntre(de: string, ate: string): string[] {
  if (!YM.test(de) || !YM.test(ate) || de > ate) return [];
  const out: string[] = [];
  let [y, m] = de.split('-').map(Number);
  while (out.length < 36) {
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    out.push(ym);
    if (ym === ate) break;
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
export function somarMeses(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
export const MESES_PADRAO = 6;

/** Lê o filtro da URL; padrão = os últimos 6 meses até o mês corrente. */
export function lerFiltroPainel(sp: Record<string, string | undefined>, hojeYm: string): FiltroPainel {
  const ate = YM.test(sp.ate ?? '') && (sp.ate as string) <= hojeYm ? (sp.ate as string) : hojeYm;
  let de = YM.test(sp.de ?? '') ? (sp.de as string) : somarMeses(ate, -(MESES_PADRAO - 1));
  if (de > ate) de = ate;
  if (mesesEntre(de, ate).length > 24) de = somarMeses(ate, -23);
  return {
    de, ate,
    unitId: sp.unit && sp.unit !== 'todas' ? sp.unit : null,
    funcao: sp.funcao?.trim() || null,
    colaborador: sp.colaborador?.trim() || null,
  };
}
export function queryDoFiltroPainel(f: FiltroPainel): string {
  const q = new URLSearchParams({ de: f.de, ate: f.ate });
  if (f.unitId) q.set('unit', f.unitId);
  if (f.funcao) q.set('funcao', f.funcao);
  if (f.colaborador) q.set('colaborador', f.colaborador);
  return q.toString();
}

export interface AvaliacaoDoPainel {
  id: string; collaboratorId: string; collaboratorName: string; unitId: string; unitName: string; yearMonth: string;
  nota: number | null; classificacao: Classificacao | null; funcao: string; evaluatorName: string;
  respostas: { key: string; label: string; score: number | null }[];
  revisaoAberta: boolean;
}
export interface AtivosDaUnidade { unitId: string; unitName: string; ativos: number }
export type StatusPlano = 'PENDING' | 'IN_PROGRESS' | 'DONE';
export interface PlanoDoPainel {
  id: string; collaboratorId: string; collaboratorName: string; unitId: string; unitName: string; yearMonth: string;
  criterionLabel: string; action: string; responsibleName: string; dueDate: string; status: StatusPlano; completedAt: string | null;
}
export type SituacaoPlano = StatusPlano | 'VENCIDO';
export const ROTULO_PLANO: Record<SituacaoPlano, string> = { PENDING: 'Pendente', IN_PROGRESS: 'Em andamento', DONE: 'Concluído', VENCIDO: 'Vencido' };
/** Vencido é DERIVADO: prazo antes de hoje e não concluído. */
export function situacaoDoPlano(p: { status: StatusPlano; dueDate: string }, hoje: string): SituacaoPlano {
  if (p.status === 'DONE') return 'DONE';
  return p.dueDate.slice(0, 10) < hoje ? 'VENCIDO' : p.status;
}

const media = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, n) => s + n, 0) / xs.length) * 100) / 100 : null);

export interface Painel {
  meses: string[];
  resumo: { avaliacoes: number; colaboradores: number; media: number | null; cobertura: number | null; abaixo: number; revisoesAbertas: number };
  classificacoes: { classificacao: Classificacao; rotulo: string; qtd: number }[];
  porUnidade: { unitId: string; unitName: string; ativos: number; avaliacoes: number; cobertura: number | null; media: number | null; abaixo: number }[];
  porFuncao: { funcao: string; avaliacoes: number; colaboradores: number; media: number | null; abaixo: number }[];
  evolucao: { yearMonth: string; avaliacoes: number; media: number | null }[];
  abaixoDoEsperado: { collaboratorId: string; collaboratorName: string; unitName: string; funcao: string; yearMonth: string; nota: number; planosAbertos: number }[];
  criterios: { key: string; label: string; media: number | null; respostas: number; abaixo: number }[];
  planos: { pendentes: number; emAndamento: number; concluidos: number; vencidos: number; lista: (PlanoDoPainel & { situacao: SituacaoPlano })[] };
}

/**
 * Monta o painel a partir das avaliações DO PERÍODO (já recortadas pelo
 * escopo e pelos filtros), dos ativos por unidade e dos planos.
 *  - cobertura = avaliações ÷ (ativos × meses do período): 100% = todo mundo
 *    avaliado todo mês;
 *  - "abaixo do esperado" = a ÚLTIMA avaliação do colaborador no período com
 *    nota < 2,50 (quem já se recuperou não aparece);
 *  - critérios com dificuldade = média por critério, menores primeiro.
 */
export function montarPainel(avals: AvaliacaoDoPainel[], ativos: AtivosDaUnidade[], planos: PlanoDoPainel[], meses: string[], hoje: string): Painel {
  const comNota = avals.filter((a): a is AvaliacaoDoPainel & { nota: number } => a.nota != null);
  const nMeses = Math.max(1, meses.length);

  const ultimaPor = new Map<string, AvaliacaoDoPainel & { nota: number }>();
  for (const a of [...comNota].sort((x, y) => x.yearMonth.localeCompare(y.yearMonth))) ultimaPor.set(a.collaboratorId, a);
  const abertosPor = new Map<string, number>();
  for (const p of planos) if (p.status !== 'DONE') abertosPor.set(p.collaboratorId, (abertosPor.get(p.collaboratorId) ?? 0) + 1);
  const abaixoDoEsperado = [...ultimaPor.values()]
    .filter((a) => a.nota < NOTA_BAIXA)
    .map((a) => ({ collaboratorId: a.collaboratorId, collaboratorName: a.collaboratorName, unitName: a.unitName, funcao: a.funcao, yearMonth: a.yearMonth, nota: a.nota, planosAbertos: abertosPor.get(a.collaboratorId) ?? 0 }))
    .sort((a, b) => a.nota - b.nota || a.collaboratorName.localeCompare(b.collaboratorName, 'pt-BR'));
  const abaixoIds = new Set(abaixoDoEsperado.map((a) => a.collaboratorId));

  const totalAtivos = ativos.reduce((s, u) => s + u.ativos, 0);
  const resumo = {
    avaliacoes: avals.length,
    colaboradores: new Set(avals.map((a) => a.collaboratorId)).size,
    media: media(comNota.map((a) => a.nota)),
    cobertura: totalAtivos ? Math.min(100, Math.round((avals.length / (totalAtivos * nMeses)) * 1000) / 10) : null,
    abaixo: abaixoDoEsperado.length,
    revisoesAbertas: avals.filter((a) => a.revisaoAberta).length,
  };

  const classificacoes = (['EXCELENTE', 'BOM', 'REGULAR', 'MELHORAR'] as Classificacao[]).map((c) => ({ classificacao: c, rotulo: ROTULO_CLASSIFICACAO[c], qtd: comNota.filter((a) => a.classificacao === c).length }));

  const porUnidade = ativos.map((u) => {
    const xs = comNota.filter((a) => a.unitId === u.unitId);
    const todas = avals.filter((a) => a.unitId === u.unitId);
    return {
      unitId: u.unitId, unitName: u.unitName, ativos: u.ativos, avaliacoes: todas.length,
      cobertura: u.ativos ? Math.min(100, Math.round((todas.length / (u.ativos * nMeses)) * 1000) / 10) : null,
      media: media(xs.map((a) => a.nota)),
      abaixo: [...new Set(xs.map((a) => a.collaboratorId))].filter((id) => abaixoIds.has(id)).length,
    };
  }).sort((a, b) => (b.media ?? -1) - (a.media ?? -1) || a.unitName.localeCompare(b.unitName, 'pt-BR'));

  const funcoes = new Map<string, (AvaliacaoDoPainel & { nota: number })[]>();
  for (const a of comNota) funcoes.set(a.funcao, [...(funcoes.get(a.funcao) ?? []), a]);
  const porFuncao = [...funcoes.entries()].map(([funcao, xs]) => ({
    funcao, avaliacoes: xs.length, colaboradores: new Set(xs.map((a) => a.collaboratorId)).size, media: media(xs.map((a) => a.nota)),
    abaixo: [...new Set(xs.map((a) => a.collaboratorId))].filter((id) => abaixoIds.has(id)).length,
  })).sort((a, b) => (b.media ?? -1) - (a.media ?? -1) || a.funcao.localeCompare(b.funcao, 'pt-BR'));

  const evolucao = meses.map((ym) => {
    const xs = comNota.filter((a) => a.yearMonth === ym);
    return { yearMonth: ym, avaliacoes: avals.filter((a) => a.yearMonth === ym).length, media: media(xs.map((a) => a.nota)) };
  });

  const crit = new Map<string, { label: string; notas: number[] }>();
  for (const a of comNota) for (const r of a.respostas) {
    if (r.score == null) continue;
    const c = crit.get(r.key) ?? { label: r.label, notas: [] };
    c.notas.push(r.score);
    crit.set(r.key, c);
  }
  const criterios = [...crit.entries()].map(([key, c]) => ({ key, label: c.label, media: media(c.notas), respostas: c.notas.length, abaixo: c.notas.filter((n) => n <= 2).length }))
    .sort((a, b) => (a.media ?? 9) - (b.media ?? 9) || b.respostas - a.respostas);

  const lista = planos.map((p) => ({ ...p, situacao: situacaoDoPlano(p, hoje) })).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const planosResumo = {
    pendentes: lista.filter((p) => p.situacao === 'PENDING').length,
    emAndamento: lista.filter((p) => p.situacao === 'IN_PROGRESS').length,
    concluidos: lista.filter((p) => p.situacao === 'DONE').length,
    vencidos: lista.filter((p) => p.situacao === 'VENCIDO').length,
    lista,
  };

  return { meses, resumo, classificacoes, porUnidade, porFuncao, evolucao, abaixoDoEsperado, criterios, planos: planosResumo };
}

/** Evolução de um critério entre a avaliação anterior e a atual (para o plano de desenvolvimento). */
export type Tendencia = 'MELHOROU' | 'IGUAL' | 'PIOROU';
export function evolucaoDoCriterio(antes: number | null | undefined, depois: number | null | undefined): { antes: number | null; depois: number | null; tendencia: Tendencia | null } {
  const a = antes ?? null; const d = depois ?? null;
  if (a == null || d == null) return { antes: a, depois: d, tendencia: null };
  return { antes: a, depois: d, tendencia: d > a ? 'MELHOROU' : d < a ? 'PIOROU' : 'IGUAL' };
}
export const ROTULO_TENDENCIA: Record<Tendencia, string> = { MELHOROU: 'Evoluiu', IGUAL: 'Sem mudança', PIOROU: 'Piorou' };

export const fmtMes = (ym: string) => { const [y, m] = ym.split('-'); return `${m}/${y}`; };
export const pct = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);
