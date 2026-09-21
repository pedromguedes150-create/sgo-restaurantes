/**
 * VARIAÇÃO DO PREÇO DO GÁS — a cadeia, não o retrato.
 *
 * O defeito que este arquivo existe para corrigir: a variação era calculada UMA
 * VEZ, no momento do lançamento, e gravada em `prevPricePerKg`/`variationPct`.
 * Duas coisas quebravam esse retrato, e as duas em silêncio:
 *
 *  1. **Nota retroativa.** A referência era "a nota mais recente da unidade"
 *     (`orderBy operationalDate desc`), não a nota ANTERIOR à que está entrando.
 *     Lançar hoje uma compra de junho comparava junho com julho — e as notas de
 *     julho continuavam apontando para a de maio, como se junho não existisse.
 *
 *  2. **Correção de data.** `editEntryDate` troca o `operationalDate` e nada
 *     recalcula. É o caso do print: a nota com "Data corrigida" ficou sem
 *     variação nenhuma, e as vizinhas continuaram comparando com quem já não
 *     era mais o vizinho.
 *
 * A saída é parar de guardar. Variação é uma função da SÉRIE ORDENADA: quem
 * pergunta, calcula. Assim a correção de data se resolve sozinha — não há
 * gatilho para alguém esquecer de chamar, que é como estes dois defeitos
 * nasceram.
 *
 * `alerted` continua gravado, e isso é de propósito: ele não é "a variação
 * desta nota", é o FATO de um alerta ter sido disparado naquele dia. Recalcular
 * um fato do passado seria reescrever história.
 *
 * Puro: sem Prisma. A ordenação e as pontas da série são onde a conta erra, e
 * separar do banco é o que permite provar cada caso.
 */

/** O mínimo que a cadeia precisa saber de um recebimento. */
export interface NotaDeGas {
  id: string;
  /** 'AAAA-MM-DD' */
  operationalDate: string;
  /** Desempate dentro do mesmo dia. */
  createdAt: Date;
  quantityKg: number;
  totalValue: number;
}

export interface NotaEncadeada<T extends NotaDeGas> {
  nota: T;
  pricePerKg: number;
  /** Preço/kg da nota IMEDIATAMENTE anterior da mesma unidade. */
  prevPrice: number | null;
  /** Variação contra a anterior. `null` na primeira nota — não há contra o quê. */
  variationPct: number | null;
}

/**
 * Preço por kg. `null` quando não há kg: dividir por zero daria `Infinity`, que
 * atravessaria a soma inteira e apareceria como um traço em toda a tela sem
 * ninguém saber de onde veio.
 */
export function precoPorKg(totalValue: number, quantityKg: number): number | null {
  if (!Number.isFinite(totalValue) || !Number.isFinite(quantityKg) || quantityKg <= 0) return null;
  return Math.round((totalValue / quantityKg) * 10000) / 10000;
}

/** Variação percentual entre dois preços, com uma casa. */
export function variacaoEntre(atual: number, anterior: number): number | null {
  if (!Number.isFinite(atual) || !Number.isFinite(anterior) || anterior <= 0) return null;
  return Math.round(((atual - anterior) / anterior) * 1000) / 10;
}

/**
 * Ordem da série: DATA e, no mesmo dia, a ordem de lançamento.
 *
 * O desempate por `createdAt` não é detalhe: no arquivo real há quatro notas no
 * mesmo 23/07. Sem critério estável, a ordem viria do banco e a variação de
 * cada uma mudaria entre duas leituras da mesma tela.
 */
export function ordemCronologica(a: NotaDeGas, b: NotaDeGas): number {
  if (a.operationalDate !== b.operationalDate) return a.operationalDate < b.operationalDate ? -1 : 1;
  const ta = a.createdAt.getTime();
  const tb = b.createdAt.getTime();
  if (ta !== tb) return ta - tb;
  /* Última garantia de estabilidade: dois lançamentos no mesmo milissegundo
     existem em importação de lote. */
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Encadeia a série de UMA unidade, do mais antigo para o mais novo.
 *
 * `ancora` é o preço/kg da última nota ANTERIOR à janela consultada. Sem ela, a
 * primeira linha de um relatório filtrado por período apareceria sem variação —
 * e pior: a variação de uma nota passaria a depender do filtro que a pessoa
 * escolheu ver, que é a definição de número que não se pode conferir.
 *
 * Nota sem kg não entra na cadeia e também NÃO a interrompe: ela não tem preço
 * para comparar, mas apagar o elo faria a nota seguinte comparar com uma
 * terceira lá atrás, inventando um salto.
 */
export function encadear<T extends NotaDeGas>(notas: T[], ancora: number | null = null): NotaEncadeada<T>[] {
  const ordenadas = [...notas].sort(ordemCronologica);
  const saida: NotaEncadeada<T>[] = [];
  let anterior: number | null = ancora;

  for (const nota of ordenadas) {
    const preco = precoPorKg(nota.totalValue, nota.quantityKg);
    if (preco === null) {
      saida.push({ nota, pricePerKg: 0, prevPrice: anterior, variationPct: null });
      continue;
    }
    saida.push({
      nota,
      pricePerKg: preco,
      prevPrice: anterior,
      variationPct: anterior !== null ? variacaoEntre(preco, anterior) : null,
    });
    anterior = preco;
  }
  return saida;
}

export interface ResumoDeGas {
  notas: number;
  kg: number;
  valor: number;
  /** Total gasto ÷ total de kg. NÃO é a média dos preços — ver a nota abaixo. */
  precoMedio: number | null;
  menorPreco: number | null;
  maiorPreco: number | null;
  primeiroPreco: number | null;
  ultimoPreco: number | null;
  /** Do primeiro ao último preço do período. */
  variacaoNoPeriodo: number | null;
}

const RESUMO_VAZIO: ResumoDeGas = {
  notas: 0, kg: 0, valor: 0, precoMedio: null, menorPreco: null,
  maiorPreco: null, primeiroPreco: null, ultimoPreco: null, variacaoNoPeriodo: null,
};

/**
 * Os números do período.
 *
 * ⚠️ `precoMedio` é **valor total ÷ kg total**, e não a média dos preços das
 * notas. É o mesmo erro do ticket médio consolidado, e sai igualmente
 * plausível: a média simples dá o mesmo peso a uma compra de 30 kg e a uma de
 * 600 kg. Quem pergunta "quanto pagamos por kg neste período" quer o preço
 * efetivo do gás que entrou — e esse é o ponderado.
 */
export function resumoDoPeriodo<T extends NotaDeGas>(encadeadas: NotaEncadeada<T>[]): ResumoDeGas {
  const comPreco = encadeadas.filter((e) => e.pricePerKg > 0);
  if (encadeadas.length === 0) return { ...RESUMO_VAZIO };

  const kg = arred(encadeadas.reduce((s, e) => s + e.nota.quantityKg, 0), 2);
  const valor = arred(encadeadas.reduce((s, e) => s + e.nota.totalValue, 0), 2);
  const precos = comPreco.map((e) => e.pricePerKg);

  const primeiro = precos[0] ?? null;
  const ultimo = precos[precos.length - 1] ?? null;

  return {
    notas: encadeadas.length,
    kg,
    valor,
    precoMedio: kg > 0 ? arred(valor / kg, 4) : null,
    menorPreco: precos.length ? Math.min(...precos) : null,
    maiorPreco: precos.length ? Math.max(...precos) : null,
    primeiroPreco: primeiro,
    ultimoPreco: ultimo,
    variacaoNoPeriodo: primeiro !== null && ultimo !== null ? variacaoEntre(ultimo, primeiro) : null,
  };
}

function arred(v: number, casas: number): number {
  const f = 10 ** casas;
  return Math.round((v + Number.EPSILON) * f) / f;
}

/** R$ 6,4639/kg — quatro casas, porque a variação vive na terceira. */
export function emPrecoKg(v: number | null): string {
  if (v == null) return '–';
  return `${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 4, maximumFractionDigits: 4 })}/kg`;
}

export function emReal(v: number | null): string {
  if (v == null) return '–';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function emKg(v: number | null): string {
  if (v == null) return '–';
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`;
}

export function emPercentual(v: number | null): string {
  if (v == null) return '–';
  return `${v > 0 ? '+' : ''}${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * PREÇO MÉDIO E FAIXA DE PLAUSIBILIDADE
 *
 * As duas nasceram do mesmo print: preço médio de R$ 48,99/kg ao lado de um
 * último preço de R$ 7,02/kg, e R$ 2,2 milhões para 46 toneladas de gás.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Soma de valor e de kg de um conjunto de notas — a base de todo preço médio. */
export function somarNotas(notas: readonly { quantityKg: number; totalValue: number }[]): { kg: number; valor: number } {
  let kg = 0;
  let valor = 0;
  for (const n of notas) {
    kg += Number(n.quantityKg) || 0;
    valor += Number(n.totalValue) || 0;
  }
  return { kg: Math.round(kg * 100) / 100, valor: Math.round(valor * 100) / 100 };
}

/**
 * Preço médio PONDERADO: valor ÷ kg, e nunca a média dos preços.
 *
 * A média simples dá o mesmo peso a uma compra de 30 kg e a uma de 600 kg — o
 * mesmo erro do ticket médio consolidado, e igualmente plausível na tela. Aqui
 * ele era pior que plausível: uma única nota fora de escala puxava a média de
 * toda a rede, e ninguém tinha como ver de onde vinha.
 */
export function mediaPonderada(notas: readonly { quantityKg: number; totalValue: number }[]): number | null {
  const { kg, valor } = somarNotas(notas);
  return precoPorKg(valor, kg);
}

/**
 * Teto de plausibilidade do preço/kg, em reais.
 *
 * O gás da rede gira em torno de R$ 6,50/kg; o teto é ~4,5× isso. Não é um
 * palpite de mercado, é o corte entre "caro" e "não pode ser preço de quilo":
 * R$ 300 é o preço de um BOTIJÃO P45 inteiro, e valores na casa dos milhares
 * são o TOTAL da nota parando na coluna de preço unitário. As duas trocas cabem
 * abaixo do teto de nenhum jeito, e nenhuma compra real chega perto dele.
 *
 * Admin ajusta em Configurações; este é só o padrão.
 */
export const TETO_PRECO_KG_PADRAO = 30;

/** O preço/kg desta nota está fora de qualquer faixa real de gás? */
export function precoImplausivel(pricePerKg: number | null, teto: number = TETO_PRECO_KG_PADRAO): boolean {
  return pricePerKg != null && Number.isFinite(pricePerKg) && pricePerKg > teto;
}
