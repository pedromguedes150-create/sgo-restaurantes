/**
 * GRÁFICOS DA TELA DE METAS — regras PURAS (v1.163.0). Nada aqui recalcula a
 * meta: as fatias, faixas e totais são COMPOSIÇÃO do que `getMetaRanking`,
 * `getMetaBreakdown` e `getUnitMonthScore` já devolvem. A nota oficial da
 * unidade continua sendo o `scorePct` de `getUnitMonthScore`.
 */

export type Faixa = 'VERDE' | 'AMBAR' | 'VERMELHO';
/** As faixas do semáforo de sempre: ≥80 verde · ≥50 âmbar · abaixo vermelho. */
export function faixaDaMeta(pct: number): Faixa {
  if (pct >= 80) return 'VERDE';
  if (pct >= 50) return 'AMBAR';
  return 'VERMELHO';
}
export const ROTULO_FAIXA: Record<Faixa, string> = { VERDE: 'Na meta (≥ 80%)', AMBAR: 'Atenção (50–79%)', VERMELHO: 'Crítico (< 50%)' };
export const COR_FAIXA: Record<Faixa, string> = { VERDE: 'var(--sgo-success)', AMBAR: 'var(--sgo-warning)', VERMELHO: 'var(--sgo-danger)' };

export interface ResumoDoRanking {
  unidades: number;
  porFaixa: { faixa: Faixa; qtd: number; unidades: string[] }[];
  media: number | null;
  mediana: number | null;
  melhor: { name: string; scorePct: number } | null;
  pior: { name: string; scorePct: number } | null;
  /** Posição (1 = melhor) da unidade pedida, ou null. */
  posicaoDe: (unitId: string) => number | null;
}

export function resumirRanking(ranking: { unitId: string; name: string; scorePct: number }[]): ResumoDoRanking {
  const ordenado = [...ranking].sort((a, b) => b.scorePct - a.scorePct);
  const notas = ordenado.map((r) => r.scorePct);
  const media = notas.length ? Math.round(notas.reduce((s, n) => s + n, 0) / notas.length) : null;
  const meio = Math.floor(notas.length / 2);
  const mediana = notas.length ? (notas.length % 2 ? notas[meio] : Math.round((notas[meio - 1] + notas[meio]) / 2)) : null;
  const porFaixa = (['VERDE', 'AMBAR', 'VERMELHO'] as Faixa[]).map((faixa) => {
    const xs = ordenado.filter((r) => faixaDaMeta(r.scorePct) === faixa);
    return { faixa, qtd: xs.length, unidades: xs.map((r) => r.name) };
  });
  return {
    unidades: ordenado.length,
    porFaixa,
    media,
    mediana,
    melhor: ordenado[0] ? { name: ordenado[0].name, scorePct: ordenado[0].scorePct } : null,
    pior: ordenado.length ? { name: ordenado[ordenado.length - 1].name, scorePct: ordenado[ordenado.length - 1].scorePct } : null,
    posicaoDe: (unitId) => { const i = ordenado.findIndex((r) => r.unitId === unitId); return i < 0 ? null : i + 1; },
  };
}

export interface LinhaDaMeta { name: string; weight: number; done: number; resolved: number; scorePct: number }
export interface FatiaDaComposicao {
  name: string; weight: number; done: number; resolved: number; scorePct: number;
  /** Peso convertido em pontos conquistados e perdidos (peso × %). */
  pontosGanhos: number; pontosPerdidos: number;
  /** Fração do peso total (0–1): o tamanho da fatia. */
  fracao: number;
  faixa: Faixa;
}
export interface Composicao {
  fatias: FatiaDaComposicao[];
  pesoTotal: number;
  pontosGanhos: number;
  pontosPerdidos: number;
  /** Linhas sem peso (ex.: "Fora do prazo"): informativas, ficam fora da rosca. */
  informativas: LinhaDaMeta[];
  /** Tarefas resolvidas no mês somando todos os componentes. */
  tarefas: { done: number; missed: number; resolved: number; pct: number | null };
  /** Onde a unidade mais perdeu pontos, do maior para o menor. */
  maioresPerdas: { name: string; pontosPerdidos: number; scorePct: number }[];
}

export function comporMeta(breakdown: LinhaDaMeta[]): Composicao {
  const comPeso = breakdown.filter((l) => l.weight > 0);
  const informativas = breakdown.filter((l) => l.weight <= 0);
  const pesoTotal = comPeso.reduce((s, l) => s + l.weight, 0);
  const fatias = comPeso.map((l) => {
    const pontosGanhos = Math.round((l.weight * l.scorePct) / 100 * 10) / 10;
    return { ...l, pontosGanhos, pontosPerdidos: Math.round((l.weight - pontosGanhos) * 10) / 10, fracao: pesoTotal ? l.weight / pesoTotal : 0, faixa: faixaDaMeta(l.scorePct) };
  });
  const pontosGanhos = Math.round(fatias.reduce((s, f) => s + f.pontosGanhos, 0) * 10) / 10;
  const done = comPeso.reduce((s, l) => s + l.done, 0);
  const resolved = comPeso.reduce((s, l) => s + l.resolved, 0);
  return {
    fatias,
    pesoTotal,
    pontosGanhos,
    pontosPerdidos: Math.round((pesoTotal - pontosGanhos) * 10) / 10,
    informativas,
    tarefas: { done, missed: resolved - done, resolved, pct: resolved ? Math.round((done / resolved) * 100) : null },
    maioresPerdas: fatias.filter((f) => f.pontosPerdidos > 0).sort((a, b) => b.pontosPerdidos - a.pontosPerdidos).slice(0, 3).map((f) => ({ name: f.name, pontosPerdidos: f.pontosPerdidos, scorePct: f.scorePct })),
  };
}

/** Caminho SVG de um arco de rosca entre duas frações (0–1) do círculo, começando no topo. */
export function arcoDaRosca(cx: number, cy: number, rExterno: number, rInterno: number, de: number, ate: number): string {
  const ini = Math.max(0, Math.min(1, de));
  let fim = Math.max(0, Math.min(1, ate));
  if (fim - ini <= 0) return '';
  if (fim - ini >= 0.9999) fim = ini + 0.9999; // círculo inteiro: evita arco degenerado
  const ang = (f: number) => (f * 2 * Math.PI) - Math.PI / 2;
  const p = (r: number, f: number) => [cx + r * Math.cos(ang(f)), cy + r * Math.sin(ang(f))].map((n) => Math.round(n * 100) / 100);
  const grande = fim - ini > 0.5 ? 1 : 0;
  const [x1, y1] = p(rExterno, ini); const [x2, y2] = p(rExterno, fim);
  const [x3, y3] = p(rInterno, fim); const [x4, y4] = p(rInterno, ini);
  return `M ${x1} ${y1} A ${rExterno} ${rExterno} 0 ${grande} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInterno} ${rInterno} 0 ${grande} 0 ${x4} ${y4} Z`;
}

/** Converte fatias (valor) em intervalos acumulados (0–1) para a rosca; valores zero ficam fora. */
export function intervalosDaRosca<T extends { valor: number }>(fatias: T[]): (T & { de: number; ate: number })[] {
  const total = fatias.reduce((s, f) => s + Math.max(0, f.valor), 0);
  if (total <= 0) return [];
  let acc = 0;
  return fatias.filter((f) => f.valor > 0).map((f) => { const de = acc; acc += f.valor / total; return { ...f, de, ate: acc }; });
}
