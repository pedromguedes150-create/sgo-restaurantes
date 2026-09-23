/**
 * O MOTOR do Controle de Massas — módulo PURO, sem banco.
 *
 * Estoque de massa não é gravado em lugar nenhum: é função da SÉRIE.
 *
 *   ESTOQUE INICIAL(D)  = contagem física confirmada mais recente antes de D
 *                         + tudo que aconteceu entre ela e D
 *   + RECEBIMENTOS(D)
 *   − MASSAS NAS PIZZAS(D)   (1 pizza vendida = 1 massa; vem do fechamento de vendas)
 *   − DESPERDÍCIOS(D)
 *   = ESTOQUE ESPERADO(D)
 *
 * Por isso a correção retroativa "recalcula tudo que for afetado" sem código
 * nenhum para isso: não há saldo gravado a atualizar — quem pergunta calcula.
 * A contagem física, essa sim gravada, NUNCA é alterada pelo recálculo; o que
 * muda é a comparação, e a diferença entre "o esperado de então" e "o esperado
 * de agora" é o que vira a sinalização de alteração retroativa.
 */

import { diasRestantes, faixaDeValidade, tipoDePerda, type FaixaDeValidade, type MotivoDesperdicio, type SituacaoDoDia } from '@/lib/pizzas/massas-tipos';

export interface LoteEntrada {
  id: string;
  /** Dia operacional do recebimento. */
  data: string;
  quantidade: number;
  validade: string;
  lotCode: string | null;
}

export interface DesperdicioEntrada {
  id: string;
  data: string;
  quantidade: number;
  motivo: MotivoDesperdicio;
  /** Lote apontado no descarte por validade (ou null). */
  loteId: string | null;
}

export interface ContagemEntrada {
  data: string;
  fisico: number;
  /** O esperado no momento em que a pessoa contou (congelado). */
  esperadoNoFechamento: number;
}

export interface SerieDeMassas {
  lotes: LoteEntrada[];
  desperdicios: DesperdicioEntrada[];
  contagens: ContagemEntrada[];
  /** Pizzas vendidas por dia operacional (fechamento de vendas, novo + legado). */
  vendasPorDia: Map<string, number>;
}

export interface DiaDeMassas {
  data: string;
  inicial: number;
  recebidas: number;
  vendidas: number;
  desperdicadas: number;
  perdaValidade: number;
  perdaProducao: number;
  esperado: number;
  fisico: number | null;
  /** físico − esperado (recalculado hoje). null sem contagem. */
  divergencia: number | null;
  /** físico − esperado congelado no fechamento. null sem contagem. */
  divergenciaNoFechamento: number | null;
  situacao: SituacaoDoDia;
  /** Houve mudança na série depois da contagem (esperado de hoje ≠ de então). */
  alteradoDepois: boolean;
}

function somaEntre<T extends { data: string; quantidade: number }>(itens: T[], depoisDe: string | null, antesDe: string): number {
  let s = 0;
  for (const i of itens) if ((depoisDe === null || i.data > depoisDe) && i.data < antesDe) s += i.quantidade;
  return s;
}

function somaNoDia<T extends { data: string; quantidade: number }>(itens: T[], dia: string): number {
  let s = 0;
  for (const i of itens) if (i.data === dia) s += i.quantidade;
  return s;
}

function vendasEntre(vendas: Map<string, number>, depoisDe: string | null, antesDe: string): number {
  let s = 0;
  for (const [d, q] of vendas) if ((depoisDe === null || d > depoisDe) && d < antesDe) s += q;
  return s;
}

/** A contagem confirmada mais recente ANTES de `dia` — a âncora do estoque inicial. */
export function ancoraAntesDe(contagens: ContagemEntrada[], dia: string): ContagemEntrada | null {
  let melhor: ContagemEntrada | null = null;
  for (const c of contagens) {
    if (c.data < dia && (!melhor || c.data > melhor.data)) melhor = c;
  }
  return melhor;
}

/** Estoque no começo do dia: âncora + o que aconteceu entre a âncora e o dia. */
export function estoqueInicial(serie: SerieDeMassas, dia: string): number {
  const ancora = ancoraAntesDe(serie.contagens, dia);
  const base = ancora?.fisico ?? 0;
  const desde = ancora?.data ?? null;
  return base
    + somaEntre(serie.lotes, desde, dia)
    - vendasEntre(serie.vendasPorDia, desde, dia)
    - somaEntre(serie.desperdicios, desde, dia);
}

/** Um dia da série, com todas as parcelas e a comparação com a contagem. */
export function calcularDia(serie: SerieDeMassas, dia: string): DiaDeMassas {
  const inicial = estoqueInicial(serie, dia);
  const recebidas = somaNoDia(serie.lotes, dia);
  const vendidas = serie.vendasPorDia.get(dia) ?? 0;
  const doDia = serie.desperdicios.filter((d) => d.data === dia);
  const perdaValidade = doDia.filter((d) => tipoDePerda(d.motivo) === 'VALIDADE').reduce((s, d) => s + d.quantidade, 0);
  const perdaProducao = doDia.filter((d) => tipoDePerda(d.motivo) === 'PRODUCAO').reduce((s, d) => s + d.quantidade, 0);
  const desperdicadas = perdaValidade + perdaProducao;
  const esperado = inicial + recebidas - vendidas - desperdicadas;

  const contagem = serie.contagens.find((c) => c.data === dia) ?? null;
  if (!contagem) {
    return { data: dia, inicial, recebidas, vendidas, desperdicadas, perdaValidade, perdaProducao, esperado, fisico: null, divergencia: null, divergenciaNoFechamento: null, situacao: 'SEM_CONTAGEM', alteradoDepois: false };
  }

  const divergencia = contagem.fisico - esperado;
  const divergenciaNoFechamento = contagem.fisico - contagem.esperadoNoFechamento;
  const alteradoDepois = contagem.esperadoNoFechamento !== esperado;

  /* A sinalização de RETROATIVO é para o dia que BATIA quando foi fechado e
     deixou de bater porque alguém mexeu na série depois. Um dia que já era
     divergente no fechamento continua DIVERGENTE — a alteração posterior fica
     visível no `alteradoDepois`, sem reescrever a natureza da divergência. */
  let situacao: SituacaoDoDia = 'CONFERIDO';
  if (divergencia !== 0) situacao = alteradoDepois && divergenciaNoFechamento === 0 ? 'RETROATIVO' : 'DIVERGENTE';

  return { data: dia, inicial, recebidas, vendidas, desperdicadas, perdaValidade, perdaProducao, esperado, fisico: contagem.fisico, divergencia, divergenciaNoFechamento, situacao, alteradoDepois };
}

/** Os dias de `de` a `ate` (inclusive), do mais recente para o mais antigo. */
export function calcularDias(serie: SerieDeMassas, de: string, ate: string): DiaDeMassas[] {
  const out: DiaDeMassas[] = [];
  for (let d = ate; d >= de; d = diaAnterior(d)) out.push(calcularDia(serie, d));
  return out;
}

export function diaAnterior(iso: string): string {
  const t = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Estoque AGORA: se hoje já foi contado, vale a contagem (é o que a pessoa viu
 * na câmara); senão, vale o esperado de hoje.
 */
export function estoqueAtual(serie: SerieDeMassas, hoje: string): number {
  const dia = calcularDia(serie, hoje);
  return dia.fisico ?? dia.esperado;
}

/* ───────────────────────────── LOTES ───────────────────────────── */

export interface LoteNoEstoque {
  id: string;
  lotCode: string | null;
  recebidoEm: string;
  quantidade: number;
  validade: string;
  disponivel: number;
  diasRestantes: number;
  faixa: FaixaDeValidade;
}

export interface PosicaoDosLotes {
  lotes: LoteNoEstoque[];
  /** Massas que a contagem física achou além do que os lotes explicam. */
  semLote: number;
  total: number;
}

/**
 * Saldo por lote — uma ESTIMATIVA, e a tela diz isso.
 *
 * O sistema sabe quantas massas saíram (pizzas + desperdício), não DE QUAL
 * lote: a regra é FIFO pela VALIDADE (a mais antiga sai primeiro), que é como a
 * pizzaria deve trabalhar. O descarte por validade aponta o lote e abate dele
 * direto. A contagem física reconcilia: sobra some do lote mais antigo, excesso
 * vira "sem lote identificado" — inventar uma validade para ele seria pior.
 *
 * Processa a série inteira em ordem, dia a dia, até `ate` (inclusive).
 */
export function posicaoDosLotes(serie: SerieDeMassas, ate: string, hoje: string): PosicaoDosLotes {
  const dias = new Set<string>();
  for (const l of serie.lotes) if (l.data <= ate) dias.add(l.data);
  for (const d of serie.desperdicios) if (d.data <= ate) dias.add(d.data);
  for (const c of serie.contagens) if (c.data <= ate) dias.add(c.data);
  for (const d of serie.vendasPorDia.keys()) if (d <= ate) dias.add(d);

  const saldo = new Map<string, number>();
  const lotesAbertos: LoteEntrada[] = [];
  let semLote = 0;

  const fifo = () => [...lotesAbertos].filter((l) => (saldo.get(l.id) ?? 0) > 0).sort((a, b) => a.validade.localeCompare(b.validade) || a.data.localeCompare(b.data));

  /** Consome `qtd` dos lotes mais antigos primeiro; o que sobrar sai do "sem lote"; o resto vira déficit devolvido. */
  const consumir = (qtd: number): number => {
    let resta = qtd;
    for (const l of fifo()) {
      if (resta <= 0) break;
      const s = saldo.get(l.id) ?? 0;
      const tira = Math.min(s, resta);
      saldo.set(l.id, s - tira);
      resta -= tira;
    }
    if (resta > 0) { const tira = Math.min(semLote, resta); semLote -= tira; resta -= tira; }
    return resta;
  };

  for (const dia of [...dias].sort()) {
    for (const l of serie.lotes) if (l.data === dia) { lotesAbertos.push(l); saldo.set(l.id, (saldo.get(l.id) ?? 0) + l.quantidade); }

    for (const w of serie.desperdicios) {
      if (w.data !== dia) continue;
      if (w.loteId && saldo.has(w.loteId)) {
        const s = saldo.get(w.loteId) ?? 0;
        const tira = Math.min(s, w.quantidade);
        saldo.set(w.loteId, s - tira);
        if (w.quantidade > tira) consumir(w.quantidade - tira);
      } else {
        consumir(w.quantidade);
      }
    }

    consumir(serie.vendasPorDia.get(dia) ?? 0);

    const c = serie.contagens.find((x) => x.data === dia);
    if (c) {
      const explicado = [...saldo.values()].reduce((s, v) => s + v, 0) + semLote;
      const diff = c.fisico - explicado;
      if (diff > 0) semLote += diff;
      else if (diff < 0) consumir(-diff);
    }
  }

  const lotes: LoteNoEstoque[] = lotesAbertos
    .filter((l) => (saldo.get(l.id) ?? 0) > 0)
    .map((l) => {
      const dias = diasRestantes(hoje, l.validade);
      return { id: l.id, lotCode: l.lotCode, recebidoEm: l.data, quantidade: l.quantidade, validade: l.validade, disponivel: saldo.get(l.id) ?? 0, diasRestantes: dias, faixa: faixaDeValidade(dias) };
    })
    .sort((a, b) => a.validade.localeCompare(b.validade) || a.recebidoEm.localeCompare(b.recebidoEm));

  return { lotes, semLote, total: lotes.reduce((s, l) => s + l.disponivel, 0) + semLote };
}

/* ───────────────────────────── RESUMO ───────────────────────────── */

export interface ResumoDeMassas {
  estoqueAtual: number;
  recebidas: number;
  utilizadas: number;
  desperdicadas: number;
  perdaValidade: number;
  perdaProducao: number;
  /** Dias com contagem cuja divergência (recalculada) não é zero. */
  divergencias: number;
  diasContados: number;
  /** desperdício ÷ (utilizadas + desperdício), em %. */
  pctDesperdicio: number;
  lotesProximosDoVencimento: number;
}

/** Os indicadores do período — a soma dos dias já calculados. */
export function resumoDoPeriodo(dias: DiaDeMassas[], posicao: PosicaoDosLotes, estoqueAtualHoje: number): ResumoDeMassas {
  const recebidas = dias.reduce((s, d) => s + d.recebidas, 0);
  const utilizadas = dias.reduce((s, d) => s + d.vendidas, 0);
  const perdaValidade = dias.reduce((s, d) => s + d.perdaValidade, 0);
  const perdaProducao = dias.reduce((s, d) => s + d.perdaProducao, 0);
  const desperdicadas = perdaValidade + perdaProducao;
  const consumo = utilizadas + desperdicadas;
  return {
    estoqueAtual: estoqueAtualHoje,
    recebidas,
    utilizadas,
    desperdicadas,
    perdaValidade,
    perdaProducao,
    divergencias: dias.filter((d) => d.divergencia !== null && d.divergencia !== 0).length,
    diasContados: dias.filter((d) => d.fisico !== null).length,
    pctDesperdicio: consumo > 0 ? Math.round((desperdicadas / consumo) * 1000) / 10 : 0,
    lotesProximosDoVencimento: posicao.lotes.filter((l) => l.faixa !== 'OK').length,
  };
}
