import { chaveDoLocal } from './regras';

/**
 * EVOLUÇÃO DO INVENTÁRIO DE UTENSÍLIOS (v1.219.0) — contas PURAS.
 *
 * Compara cada contagem ENVIADA com a anterior do MESMO local da mesma
 * unidade. "Quebra" = o que diminuiu; "sobra" = o que aumentou. O SGO não
 * sabe se chegou reposição entre uma contagem e outra, então "sobra" inclui
 * compra — a tela diz isso. Utensílio que só existe numa das duas contagens
 * não entra na diferença (não há com o que comparar).
 */

export interface Contagem {
  id: string; unitId: string; unidade: string; local: string;
  /** Instante do (primeiro) envio. */
  quando: Date;
  managerName: string;
  itens: { name: string; quantity: number | null }[];
}

const chaveDoItem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

export interface LinhaComparada { name: string; atual: number | null; anterior: number | null; diff: number | null }
export interface Comparacao { linhas: LinhaComparada[]; quebras: number; sobras: number; saldo: number; totalAtual: number; totalAnterior: number | null }

/** Item a item: atual × anterior. Sem anterior, só as quantidades atuais. */
export function compararContagens(atual: Contagem, anterior: Contagem | null): Comparacao {
  const antes = new Map((anterior?.itens ?? []).map((i) => [chaveDoItem(i.name), i.quantity]));
  const vistos = new Set<string>();
  const linhas: LinhaComparada[] = atual.itens.map((i) => {
    const k = chaveDoItem(i.name); vistos.add(k);
    const a = antes.has(k) ? antes.get(k)! : null;
    return { name: i.name, atual: i.quantity, anterior: a, diff: i.quantity !== null && a !== null ? i.quantity - a : null };
  });
  for (const i of anterior?.itens ?? []) if (!vistos.has(chaveDoItem(i.name))) linhas.push({ name: i.name, atual: null, anterior: i.quantity, diff: null });
  let quebras = 0; let sobras = 0;
  for (const l of linhas) { if (l.diff === null) continue; if (l.diff < 0) quebras += -l.diff; else sobras += l.diff; }
  const soma = (c: Contagem) => c.itens.reduce((s, i) => s + (i.quantity ?? 0), 0);
  return { linhas, quebras, sobras, saldo: sobras - quebras, totalAtual: soma(atual), totalAnterior: anterior ? soma(anterior) : null };
}

export interface PontoDaSerie { id: string; quando: Date; rotulo: string; total: number; quebras: number | null; sobras: number | null }
export interface SerieDoLocal {
  chave: string; unitId: string; unidade: string; local: string;
  pontos: PontoDaSerie[];
  ultima: Contagem; anterior: Contagem | null;
  comparacao: Comparacao;
  /** Quebras da comparação anterior (penúltima × antepenúltima), para dizer "maior ou menor". */
  quebrasAntes: number | null; sobrasAntes: number | null;
}

const rotuloDoDia = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit' });

/** Agrupa por unidade+local e monta a série de cada um, da contagem mais antiga à mais recente. */
export function seriesPorLocal(contagens: Contagem[], maxPontos = 12): SerieDoLocal[] {
  const grupos = new Map<string, Contagem[]>();
  for (const c of contagens) {
    const k = `${c.unitId}|${chaveDoLocal(c.local)}`;
    (grupos.get(k) ?? grupos.set(k, []).get(k)!).push(c);
  }
  const out: SerieDoLocal[] = [];
  for (const [chave, lista] of grupos) {
    const ord = [...lista].sort((a, b) => a.quando.getTime() - b.quando.getTime());
    const pontos: PontoDaSerie[] = ord.map((c, i) => {
      const cmp = i > 0 ? compararContagens(c, ord[i - 1]) : null;
      return { id: c.id, quando: c.quando, rotulo: rotuloDoDia(c.quando), total: c.itens.reduce((s, x) => s + (x.quantity ?? 0), 0), quebras: cmp ? cmp.quebras : null, sobras: cmp ? cmp.sobras : null };
    });
    const ultima = ord[ord.length - 1];
    const anterior = ord.length > 1 ? ord[ord.length - 2] : null;
    const penultimo = pontos.length > 1 ? pontos[pontos.length - 2] : null;
    out.push({
      chave, unitId: ultima.unitId, unidade: ultima.unidade, local: ultima.local,
      pontos: pontos.slice(-maxPontos), ultima, anterior,
      comparacao: compararContagens(ultima, anterior),
      quebrasAntes: penultimo?.quebras ?? null, sobrasAntes: penultimo?.sobras ?? null,
    });
  }
  return out.sort((a, b) => a.unidade.localeCompare(b.unidade, 'pt-BR') || a.local.localeCompare(b.local, 'pt-BR'));
}

/** "maior", "menor" ou "igual" ao da comparação anterior; nulo quando não há com o que comparar. */
export function tendencia(agora: number | null, antes: number | null): 'maior' | 'menor' | 'igual' | null {
  if (agora === null || antes === null) return null;
  return agora > antes ? 'maior' : agora < antes ? 'menor' : 'igual';
}

export interface RelacaoDaUnidade {
  unitId: string; unidade: string;
  /** Uma coluna por local: a contagem enviada mais recente dele no período. */
  colunas: { local: string; quando: Date; managerName: string; total: number }[];
  linhas: { name: string; porLocal: (number | null)[]; total: number }[];
  total: number;
}

/**
 * A RELAÇÃO de utensílios (o PDF): por unidade, um utensílio por linha e uma
 * coluna por local, com a contagem mais recente de cada local. Utensílio que
 * um local não tem fica vazio (não é zero).
 */
export function relacaoPorUnidade(contagens: Contagem[]): RelacaoDaUnidade[] {
  return agruparPorUnidade(seriesPorLocal(contagens)).map(({ unitId, unidade, series }) => {
    const cols = series.map((s) => s.ultima);
    const ordem: string[] = []; const nomes = new Map<string, string>();
    for (const c of cols) for (const i of c.itens) { const k = chaveDoItem(i.name); if (!nomes.has(k)) { nomes.set(k, i.name); ordem.push(k); } }
    const linhas = ordem.map((k) => {
      const porLocal = cols.map((c) => { const it = c.itens.find((i) => chaveDoItem(i.name) === k); return it ? it.quantity : null; });
      return { name: nomes.get(k)!, porLocal, total: porLocal.reduce<number>((s, q) => s + (q ?? 0), 0) };
    });
    const colunas = cols.map((c) => ({ local: c.local, quando: c.quando, managerName: c.managerName, total: c.itens.reduce((s, i) => s + (i.quantity ?? 0), 0) }));
    return { unitId, unidade, colunas, linhas, total: colunas.reduce((s, c) => s + c.total, 0) };
  });
}

export function agruparPorUnidade(series: SerieDoLocal[]): { unitId: string; unidade: string; series: SerieDoLocal[] }[] {
  const out: { unitId: string; unidade: string; series: SerieDoLocal[] }[] = [];
  for (const s of series) {
    const g = out.find((o) => o.unitId === s.unitId);
    if (g) g.series.push(s); else out.push({ unitId: s.unitId, unidade: s.unidade, series: [s] });
  }
  return out;
}
