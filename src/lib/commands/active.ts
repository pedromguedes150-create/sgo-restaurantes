import { prisma } from '@/lib/db/prisma';
import { programacaoDeHoje } from '@/lib/commands/programacao-dados';
import { numerosDaProgramacao, type ProgramacaoDoDia } from '@/lib/commands/programacao';

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
  /** Reposições JÁ RECEBIDAS fisicamente — só estas entram na sequência (v1.202.0). */
  replacements: Set<number>;
  /** v1.202.0: reposições cadastradas e ainda aguardando confirmação de recebimento (não entram na conta). */
  replacementsPending: number[];
  /**
   * Faixas marcadas como conferidas na MADRUGADA. Vazio quando nenhuma faixa foi
   * marcada — e aí a rotina da madrugada confere tudo, como sempre foi.
   */
  nightly: Set<number>;
  /** Existe pelo menos uma faixa marcada para a madrugada? */
  hasNightly: boolean;
  /**
   * v1.201.0 — o que a PROGRAMAÇÃO da unidade manda para hoje. Quando há uma
   * (exceção do dia ou programação por dia/turno), `nightly`/`hasNightly` já vêm
   * dela: faixa do dia = os números da faixa; completa = nenhum (confere tudo).
   * Sem programação, `origem: 'PADRAO'` e vale a rotina de sempre.
   */
  programacao: ProgramacaoDoDia;
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
export async function getActiveSequence(unitId: string, opts: { agora?: Date; ignorarProgramacao?: boolean } = {}): Promise<ActiveSequence> {
  const sequences = await prisma.commandSequence.findMany({ where: { unitId, active: true }, select: { rangeStart: true, rangeEnd: true, nightly: true } });

  const closedRows = await prisma.commandDivergence.findMany({
    where: { unitId, status: 'CLOSED', outcome: { in: ['LOST', 'RECOVERED'] } },
    /* NULL primeiro: uma LOST antiga sem resolvedAt não pode vencer uma RECOVERED posterior. */
    orderBy: [{ resolvedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
    select: { number: true, outcome: true },
  });
  const replRows = await prisma.commandReplacement.findMany({ where: { unitId }, select: { number: true, receivedAt: true } });

  /* O último desfecho de cada número decide: LOST = baixada; RECOVERED depois
     da baixa = voltou à sequência (a recuperação pela conferência grava uma
     divergência já encerrada como RECUPERADA, sem reescrever a da baixa). */
  const ultimoDesfecho = new Map<number, string>();
  for (const r of closedRows) ultimoDesfecho.set(r.number, r.outcome ?? '');
  const lost = new Set([...ultimoDesfecho].filter(([, o]) => o === 'LOST').map(([n]) => n));
  const replacements = new Set(replRows.filter((r) => r.receivedAt).map((r) => r.number));
  const replacementsPending = replRows.filter((r) => !r.receivedAt).map((r) => r.number).sort((a, b) => a - b);

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
  let hasNightly = sequences.some((s) => s.nightly);

  /* v1.201.0: a programação do dia sobrepõe a marcação "madrugada" das faixas. */
  const semProgramacao: ProgramacaoDoDia = { origem: 'PADRAO', nome: null, tipo: null, faixa: null, semConferencia: false, concorrentes: [] };
  const programacao = opts.ignorarProgramacao || all.size === 0 ? semProgramacao : await programacaoDeHoje(unitId, opts.agora);
  if (programacao.origem !== 'PADRAO' && programacao.tipo) {
    const numeros = numerosDaProgramacao(programacao, all);
    nightly.clear();
    if (numeros) for (const n of numeros) nightly.add(n);
    hasNightly = nightly.size > 0; // completa (numeros nulo) = confere tudo
  }

  // config = resumo (mín..máx) — usado como "configurado?" e exibição
  const config = sequences.length
    ? { rangeStart: Math.min(...sequences.map((s) => s.rangeStart)), rangeEnd: Math.max(...sequences.map((s) => s.rangeEnd)) }
    : null;

  return { config, all, active, lost, replacements, replacementsPending, nightly, hasNightly, programacao };
}
