import { prisma } from '@/lib/db/prisma';

export interface ActiveSequence {
  config: { rangeStart: number; rangeEnd: number } | null;
  /**
   * v1.193.0: a SEQUÊNCIA INTEIRA — faixas + reposições, INCLUINDO as baixadas.
   * É o que a grade mostra e o que o leitor aceita: uma comanda dada como
   * perdida pode voltar a aparecer, e a conferência seguinte precisa poder
   * marcá-la (decisão do Pedro, 06/11: "se a unidade tem de 1 a 700, deixe a
   * sequência 1, 2, 3… e não 1, 2, 4, 5, 6, 7, 9").
   */
  all: Set<number>;
  /** O que é JULGADO numa contagem: `all` menos as baixadas. */
  active: Set<number>;
  lost: Set<number>;
  replacements: Set<number>;
  /**
   * Faixas marcadas como conferidas na MADRUGADA. Vazio quando nenhuma faixa foi
   * marcada — e aí a rotina da madrugada confere tudo, como sempre foi.
   */
  nightly: Set<number>;
  /** Existe pelo menos uma faixa marcada para a madrugada? */
  hasNightly: boolean;
}

/**
 * Sequência de comandas de uma unidade (Módulo 3):
 *   all    = [rangeStart..rangeEnd] + reposições            (a grade, o leitor)
 *   active = all − baixadas (perdidas)                        (o que é julgado)
 * Comandas com baixa definitiva NÃO reaparecem como ausentes — mas continuam na
 * grade, e marcá-las presentes numa conferência as RECUPERA (v1.193.0). Por
 * isso "baixada" é o ÚLTIMO desfecho registrado para o número: uma divergência
 * encerrada como RECUPERADA depois da baixa desfaz a baixa.
 */
export async function getActiveSequence(unitId: string): Promise<ActiveSequence> {
  const sequences = await prisma.commandSequence.findMany({ where: { unitId, active: true }, select: { rangeStart: true, rangeEnd: true, nightly: true } });

  const closedRows = await prisma.commandDivergence.findMany({
    where: { unitId, status: 'CLOSED', outcome: { in: ['LOST', 'RECOVERED'] } },
    orderBy: [{ resolvedAt: 'asc' }, { createdAt: 'asc' }],
    select: { number: true, outcome: true },
  });
  const replRows = await prisma.commandReplacement.findMany({ where: { unitId }, select: { number: true } });

  /* O último desfecho de cada número decide: LOST = baixada; RECOVERED depois
     da baixa = voltou à sequência (a recuperação pela conferência grava uma
     divergência já encerrada como RECUPERADA, sem reescrever a da baixa). */
  const ultimoDesfecho = new Map<number, string>();
  for (const r of closedRows) ultimoDesfecho.set(r.number, r.outcome ?? '');
  const lost = new Set([...ultimoDesfecho].filter(([, o]) => o === 'LOST').map(([n]) => n));
  const replacements = new Set(replRows.map((r) => r.number));

  const all = new Set<number>();
  const nightly = new Set<number>();
  for (const s of sequences) {
    for (let n = s.rangeStart; n <= s.rangeEnd; n++) {
      all.add(n);
      if (s.nightly) nightly.add(n);
    }
  }
  for (const n of replacements) {
    all.add(n);
    // reposição herda a rotina da faixa em que o número cai
    if (sequences.some((s) => s.nightly && n >= s.rangeStart && n <= s.rangeEnd)) nightly.add(n);
  }
  const active = new Set([...all].filter((n) => !lost.has(n)));
  const hasNightly = sequences.some((s) => s.nightly);

  // config = resumo (mín..máx) — usado como "configurado?" e exibição
  const config = sequences.length
    ? { rangeStart: Math.min(...sequences.map((s) => s.rangeStart)), rangeEnd: Math.max(...sequences.map((s) => s.rangeEnd)) }
    : null;

  return { config, all, active, lost, replacements, nightly, hasNightly };
}
