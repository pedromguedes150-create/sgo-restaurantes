/**
 * TICKET MÉDIO — a aritmética do módulo, num arquivo só e sem Prisma.
 *
 * Puro de propósito: a tela, a prévia da importação, o consolidado e o cartão
 * do Dashboard chamam as MESMAS funções. Cada lado com a sua conta é como o
 * painel e o relatório passam a discordar em três meses, e ninguém descobre
 * qual dos dois está certo.
 *
 * Três regras mandam aqui, e as três já foram erradas em planilha:
 *
 *   1. RECEITA = venda − desconto.   (somar o desconto infla o faturamento)
 *   2. TICKET  = receita ÷ cupons.   (nunca venda ÷ cupons)
 *   3. CONSOLIDADO = Σreceita ÷ Σcupons, e NUNCA a média dos tickets.
 *
 * A terceira é a mais traiçoeira porque o número sai plausível: a média simples
 * dá o mesmo peso a uma unidade de 2.000 cupons e a uma de 50.000. Veja
 * `ticketConsolidado`.
 */

/** Competência no formato "AAAA-MM" — o mês é a unidade deste módulo. */
export type Competencia = string;

export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const;

const FORMATO = /^\d{4}-(0[1-9]|1[0-2])$/;

export function competenciaValida(v: unknown): v is Competencia {
  return typeof v === 'string' && FORMATO.test(v);
}

export function montarCompetencia(ano: number, mes: number): Competencia {
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}`;
}

export function partesDaCompetencia(c: Competencia): { ano: number; mes: number } {
  return { ano: Number(c.slice(0, 4)), mes: Number(c.slice(5, 7)) };
}

/** "2026-09" → "Setembro/2026". */
export function rotuloDaCompetencia(c: Competencia): string {
  if (!competenciaValida(c)) return c;
  const { ano, mes } = partesDaCompetencia(c);
  return `${MESES[mes - 1]}/${ano}`;
}

/** Anda `n` meses (pode ser negativo). "2026-01" −1 → "2025-12". */
export function deslocarCompetencia(c: Competencia, n: number): Competencia {
  const { ano, mes } = partesDaCompetencia(c);
  const total = ano * 12 + (mes - 1) + n;
  return montarCompetencia(Math.floor(total / 12), (total % 12) + 1);
}

export const competenciaAnterior = (c: Competencia) => deslocarCompetencia(c, -1);

/** Da mais antiga para a mais nova, com as duas pontas incluídas. */
export function competenciasEntre(de: Competencia, ate: Competencia): Competencia[] {
  const saida: Competencia[] = [];
  let atual = de;
  /* Teto de 10 anos: um intervalo invertido por engano (de > ate) devolveria
     lista vazia, mas um `ate` absurdo montaria milhares de colunas de gráfico. */
  for (let i = 0; atual <= ate && i < 120; i++) {
    saida.push(atual);
    atual = deslocarCompetencia(atual, 1);
  }
  return saida;
}

/** A competência do mês corrente, na data informada (injetável para teste). */
export function competenciaDeHoje(agora = new Date()): Competencia {
  return montarCompetencia(agora.getFullYear(), agora.getMonth() + 1);
}

// ── As três regras ────────────────────────────────────────────────────────

/** Os números crus de uma unidade num mês — o que a planilha somou. */
export interface NumerosBrutos {
  coupons: number;
  grossSales: number;
  discounts: number;
}

/**
 * REGRA 1 — receita = venda − desconto.
 *
 * O desconto SAI da venda; ele não é receita adicional. Somar (150.000 + 30.000
 * = 180.000 em vez de 120.000) é o erro que motivou escrever a regra por
 * extenso no pedido, e é por isso que ele mora numa função só.
 */
export function receita(n: NumerosBrutos): number {
  return arredondar(n.grossSales - n.discounts);
}

/**
 * REGRA 2 — ticket médio = receita ÷ cupons.
 *
 * Sem cupom não há ticket: devolve `null`, e não zero. Zero afirmaria "o ticket
 * foi R$ 0,00", que é uma informação — e uma informação falsa. `null` é a
 * ausência, que os cartões já sabem desenhar como "–".
 */
export function ticketMedio(n: NumerosBrutos): number | null {
  if (!n.coupons || n.coupons <= 0) return null;
  return arredondar(receita(n) / n.coupons);
}

/** Soma componente a componente. Base do consolidado. */
export function somar(linhas: NumerosBrutos[]): NumerosBrutos {
  return linhas.reduce<NumerosBrutos>(
    (a, l) => ({
      coupons: a.coupons + l.coupons,
      grossSales: arredondar(a.grossSales + l.grossSales),
      discounts: arredondar(a.discounts + l.discounts),
    }),
    { coupons: 0, grossSales: 0, discounts: 0 },
  );
}

/**
 * REGRA 3 — consolidado = Σreceita ÷ Σcupons.
 *
 * NÃO é a média dos tickets das unidades. Com A (R$ 100.000 / 2.000 cupons =
 * R$ 50,00) e B (R$ 300.000 / 5.000 = R$ 60,00):
 *
 *   média simples .... (50 + 60) / 2      = R$ 55,00   ❌
 *   consolidado ...... 400.000 / 7.000    = R$ 57,14   ✅
 *
 * A média simples dá o mesmo peso às duas, como se a unidade pequena vendesse
 * tanto quanto a grande. O número sai plausível, e é por isso que o erro
 * sobrevive em planilha durante anos.
 */
export function ticketConsolidado(linhas: NumerosBrutos[]): number | null {
  return ticketMedio(somar(linhas));
}

/**
 * Variação percentual de um mês para o outro.
 *
 * Sem base de comparação (mês anterior ausente ou zerado) devolve `null`: de
 * zero para qualquer coisa a variação é infinita, e "+100%" seria invenção.
 */
export function variacao(atual: number | null, anterior: number | null): number | null {
  if (atual == null || anterior == null || anterior === 0) return null;
  return Math.round(((atual - anterior) / anterior) * 1000) / 10;
}

/** Duas casas — dinheiro. Evita 0.1+0.2 aparecendo na tela. */
export function arredondar(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

// ── Formatação (a tela e a prévia mostram igual) ──────────────────────────

export function emReal(v: number | null): string {
  if (v == null) return '–';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function emNumero(v: number | null): string {
  if (v == null) return '–';
  return v.toLocaleString('pt-BR');
}

export function emPercentual(v: number | null): string {
  if (v == null) return '–';
  return `${v > 0 ? '+' : ''}${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}
