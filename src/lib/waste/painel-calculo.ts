/**
 * PAINEL DE DESPERDÍCIO — núcleo PURO da Conferência e da Performance (v1.152.0).
 *
 * Pedido do Pedro (05/10/2026): o painel consolidado estava "genérico"; ele quer
 * conferir lançamento a lançamento (com as fotos) e uma aba de performance com
 * gráficos para saber se o desperdício AUMENTOU ou DIMINUIU.
 *
 * As duas frentes (Restaurante em kg, Salgados em unidades) entram aqui com o
 * MESMO formato — um registro por unidade × dia lançado — e nunca se misturam:
 * quem chama passa uma frente de cada vez.
 *
 * ⚠️ A comparação principal é a MÉDIA POR DIA LANÇADO, não o total. Total de um
 * mês com 10 dias lançados contra um de 28 "cai" 60% sem ninguém ter desperdiçado
 * menos — só lançou menos. A tela mostra os dois, mas a seta de subiu/caiu vem
 * da média, e a cobertura (dias lançados) aparece ao lado.
 */
import { variacaoPct } from '@/lib/waste/tipos';

/** Um lançamento: uma unidade num dia operacional. */
export interface RegistroDia {
  unitId: string;
  /** AAAA-MM-DD (dia operacional). */
  date: string;
  total: number;
  /** Detalhe do total: código do tipo (Restaurante) ou nome do salgado. */
  partes: Record<string, number>;
  /** Só Salgados: total por motivo. */
  motivos?: Record<string, number>;
}

export type Direcao = 'subiu' | 'caiu' | 'estavel' | 'sem-base';

/** Variação abaixo disto (em %) é ruído — "estável". */
export const FAIXA_ESTAVEL_PCT = 5;

export function direcao(v: number | null): Direcao {
  if (v === null) return 'sem-base';
  if (Math.abs(v) < FAIXA_ESTAVEL_PCT) return 'estavel';
  return v > 0 ? 'subiu' : 'caiu';
}

const dois = (n: number) => String(n).padStart(2, '0');
export const ymDe = (year: number, month: number) => `${year}-${dois(month)}`;

export function ymMenos(year: number, month: number, k: number): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month - 1 - k, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/** "Hoje" no fuso da operação (o servidor roda em UTC). */
export function hojeEmBrasilia(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Faixa [de, ate) do mês em AAAA-MM-DD. */
export function faixaDoMes(year: number, month: number): { de: string; ate: string } {
  const p = ymMenos(year, month, -1);
  return { de: `${ymDe(year, month)}-01`, ate: `${ymDe(p.year, p.month)}-01` };
}

/** Dias do mês já decorridos (até hoje, inclusive). Mês futuro = nenhum. */
export function diasDoMes(year: number, month: number, hoje: string): string[] {
  const n = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const out: string[] = [];
  for (let d = 1; d <= n; d++) {
    const iso = `${ymDe(year, month)}-${dois(d)}`;
    if (iso > hoje) break;
    out.push(iso);
  }
  return out;
}

/** Total, nº de lançamentos (unidade × dia) e média por lançamento. */
export interface Resumo { total: number; lancamentos: number; media: number }

export function resumir(regs: RegistroDia[]): Resumo {
  const total = regs.reduce((s, r) => s + r.total, 0);
  const lancamentos = regs.length;
  return { total, lancamentos, media: lancamentos ? total / lancamentos : 0 };
}

/** Variação da MÉDIA por dia lançado — a que decide subiu/caiu. */
export function variacaoDaMedia(atual: Resumo, anterior: Resumo): number | null {
  if (!anterior.lancamentos || !atual.lancamentos) return null;
  return variacaoPct(atual.media, anterior.media);
}

/** Um ponto por dia do mês (dias sem lançamento ficam com 0 e `lancamentos: 0`). */
export function serieDiaria(regs: RegistroDia[], dias: string[]): { date: string; total: number; lancamentos: number }[] {
  const por = new Map<string, { total: number; lancamentos: number }>();
  for (const r of regs) {
    const p = por.get(r.date) ?? { total: 0, lancamentos: 0 };
    p.total += r.total;
    p.lancamentos += 1;
    por.set(r.date, p);
  }
  return dias.map((d) => ({ date: d, total: por.get(d)?.total ?? 0, lancamentos: por.get(d)?.lancamentos ?? 0 }));
}

export interface LinhaPorUnidade {
  unitId: string;
  unitName: string;
  atual: Resumo;
  anterior: Resumo;
  variacao: number | null;
  direcao: Direcao;
}

/** Atual × anterior por unidade, pior primeiro (maior alta da média no topo). */
export function porUnidade(atual: RegistroDia[], anterior: RegistroDia[], unidades: { id: string; name: string }[]): LinhaPorUnidade[] {
  const linhas = unidades.map((u) => {
    const a = resumir(atual.filter((r) => r.unitId === u.id));
    const b = resumir(anterior.filter((r) => r.unitId === u.id));
    const v = variacaoDaMedia(a, b);
    return { unitId: u.id, unitName: u.name, atual: a, anterior: b, variacao: v, direcao: direcao(v) };
  });
  const peso = (l: LinhaPorUnidade) => (l.variacao === null ? -Infinity : l.variacao);
  return linhas.sort((x, y) => peso(y) - peso(x) || y.atual.total - x.atual.total || x.unitName.localeCompare(y.unitName, 'pt-BR'));
}

export interface LinhaPorParte { chave: string; atual: number; anterior: number; variacao: number | null; direcao: Direcao; participacao: number }

/**
 * Atual × anterior por tipo (ou por motivo). Aqui a comparação é do TOTAL por
 * parte, normalizado pelos dias lançados de cada período — o mesmo raciocínio
 * da média: "coxinha caiu" não pode ser "lançaram menos dias".
 */
export function porParte(atual: RegistroDia[], anterior: RegistroDia[], campo: 'partes' | 'motivos' = 'partes'): LinhaPorParte[] {
  const somar = (regs: RegistroDia[]) => {
    const m = new Map<string, number>();
    for (const r of regs) for (const [k, v] of Object.entries(r[campo] ?? {})) m.set(k, (m.get(k) ?? 0) + v);
    return m;
  };
  const ma = somar(atual), mb = somar(anterior);
  const na = atual.length, nb = anterior.length;
  const totalAtual = [...ma.values()].reduce((s, v) => s + v, 0);
  const chaves = new Set([...ma.keys(), ...mb.keys()]);
  const linhas = [...chaves].map((k) => {
    const a = ma.get(k) ?? 0, b = mb.get(k) ?? 0;
    const v = na && nb && b ? variacaoPct(a / na, b / nb) : null;
    return { chave: k, atual: a, anterior: b, variacao: v, direcao: direcao(v), participacao: totalAtual ? (a / totalAtual) * 100 : 0 };
  });
  return linhas.filter((l) => l.atual > 0 || l.anterior > 0).sort((x, y) => y.atual - x.atual || y.anterior - x.anterior || x.chave.localeCompare(y.chave, 'pt-BR'));
}

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** Média por lançamento em cada dia da semana (seg → dom). */
export function porDiaDaSemana(regs: RegistroDia[]): { dia: string; lancamentos: number; media: number }[] {
  const acc = Array.from({ length: 7 }, () => ({ total: 0, n: 0 }));
  for (const r of regs) {
    const w = new Date(`${r.date}T12:00:00Z`).getUTCDay();
    acc[w].total += r.total;
    acc[w].n += 1;
  }
  const ordem = [1, 2, 3, 4, 5, 6, 0];
  return ordem.map((w) => ({ dia: DIAS_SEMANA[w], lancamentos: acc[w].n, media: acc[w].n ? acc[w].total / acc[w].n : 0 }));
}

/** Um ponto por mês (do mais antigo ao atual). */
export function tendenciaMensal(regs: RegistroDia[], year: number, month: number, meses: number): ({ ym: string } & Resumo)[] {
  const out: ({ ym: string } & Resumo)[] = [];
  for (let k = meses - 1; k >= 0; k--) {
    const m = ymMenos(year, month, k);
    const ym = ymDe(m.year, m.month);
    out.push({ ym, ...resumir(regs.filter((r) => r.date.startsWith(ym))) });
  }
  return out;
}

/* ─────────────────────────── conferência ─────────────────────────── */

export type SituacaoDaFoto = 'completa' | 'parcial' | 'sem-foto' | 'sem-peso';

/**
 * Situação da foto de um lançamento. `exigidas` = o que deveria ter foto
 * (procedimentos com peso no Restaurante; "o dia" nos Salgados), `com` = o que tem.
 */
export function situacaoDaFoto(exigidas: string[], com: string[]): SituacaoDaFoto {
  if (exigidas.length === 0) return com.length ? 'completa' : 'sem-peso';
  const tem = new Set(com);
  const ok = exigidas.filter((c) => tem.has(c)).length;
  if (ok === exigidas.length) return 'completa';
  return ok === 0 ? 'sem-foto' : 'parcial';
}

/**
 * Lançado DEPOIS do dia? O dia operacional vira às 04:00, então lançar de
 * madrugada no dia seguinte ainda é "no dia"; a partir do segundo dia é retroativo.
 */
export function lancadoDepois(operationalDate: string, criadoEmBrasilia: string): boolean {
  const d = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return (d(criadoEmBrasilia) - d(operationalDate)) / 86_400_000 > 1;
}

export type CelulaDoMapa = 'completa' | 'parcial' | 'sem-foto' | 'sem-peso' | null;

/** Mapa unidade × dia do mês: o que cada dia tem (null = não lançou). */
export function mapaDeLancamentos(
  unidades: { id: string; name: string }[],
  dias: string[],
  registros: { unitId: string; date: string; foto: SituacaoDaFoto }[],
): { unitId: string; unitName: string; dias: CelulaDoMapa[]; lancados: number }[] {
  const por = new Map(registros.map((r) => [`${r.unitId}|${r.date}`, r.foto]));
  return unidades.map((u) => {
    const cel = dias.map((d) => por.get(`${u.id}|${d}`) ?? null);
    return { unitId: u.id, unitName: u.name, dias: cel, lancados: cel.filter((c) => c !== null).length };
  });
}

/** dd/mm/aaaa — a tela não mostra mais "2026-09-30". */
export function dataBR(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
