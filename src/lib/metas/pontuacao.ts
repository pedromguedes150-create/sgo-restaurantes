/**
 * PONTUAÇÃO DA META (v1.174.0) — a conta, sem banco.
 *
 * Toda linha que pesa na nota é um COMPONENTE: nome, peso configurado e o par
 * `done`/`missed` do mês. A nota é Σ(peso × done ÷ resolvido) ÷ Σ(peso) × 100,
 * e componente com peso 0 OU sem nada resolvido no mês fica FORA da conta —
 * "nada a fazer" não é zero, é ausência (um mês sem cancelamento não pode
 * derrubar a nota de Cancelamentos, nem inflá-la).
 *
 * Depois da composição vêm os DESCONTOS (fora do prazo, gerente sem folga):
 * cada um tira `quantidade × pct` direto da nota, que nunca fica negativa.
 *
 * Este arquivo não importa nada: `componentes.ts` monta a lista a partir dos
 * módulos, e tanto a nota (`getUnitMonthScore`) quanto o detalhamento
 * (`getMetaBreakdown`) passam por aqui — é o que garante que as duas telas
 * nunca discordem.
 */

export interface ComponenteDaMeta {
  /** Chave do módulo na matriz (TASKS, WASTE, CASH…). */
  key: string;
  name: string;
  weight: number;
  done: number;
  missed: number;
}

export interface DescontoDaMeta {
  name: string;
  /** Ocorrências que descontam (datas corrigidas, gerentes sem folga…). */
  quantidade: number;
  /** % descontado por ocorrência. */
  pct: number;
}

export interface Pontuacao { scorePct: number; doneWeight: number; resolvedWeight: number }

export function pontuar(componentes: ComponenteDaMeta[], descontos: DescontoDaMeta[] = []): Pontuacao {
  let doneWeight = 0;
  let resolvedWeight = 0;
  for (const c of componentes) {
    const resolved = c.done + c.missed;
    if (resolved <= 0 || c.weight <= 0) continue;
    resolvedWeight += c.weight;
    doneWeight += c.weight * (c.done / resolved);
  }
  let scorePct = resolvedWeight === 0 ? 0 : Math.round((doneWeight / resolvedWeight) * 100);
  for (const d of descontos) {
    if (d.quantidade > 0 && d.pct > 0) scorePct = Math.max(0, Math.round(scorePct - d.quantidade * d.pct));
  }
  return { scorePct, doneWeight, resolvedWeight };
}

export interface LinhaDeComponente { name: string; weight: number; done: number; resolved: number; scorePct: number }

/** As linhas do detalhamento: só o que de fato pesou (peso > 0 e algo resolvido), do maior peso para o menor. */
export function linhasDosComponentes(componentes: ComponenteDaMeta[]): LinhaDeComponente[] {
  return componentes
    .filter((c) => c.weight > 0 && c.done + c.missed > 0)
    .map((c) => ({ name: c.name, weight: c.weight, done: c.done, resolved: c.done + c.missed, scorePct: Math.round((c.done / (c.done + c.missed)) * 100) }))
    .sort((a, b) => b.weight - a.weight);
}

/** Dia civil 'AAAA-MM-DD' em Brasília. O servidor roda em UTC: às 22h daqui já é amanhã lá. */
export function diaEmBrasilia(agora: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

/**
 * Dias DECORRIDOS do mês para as coberturas diárias: até ONTEM no mês corrente
 * (o dia de hoje ainda está aberto), o mês inteiro num mês passado, ZERO num
 * mês futuro — a versão anterior devolvia o mês inteiro para o futuro, e um
 * relatório de novembro aberto em outubro cobraria 30 dias de nada.
 */
export function diasDecorridos(yearMonth: string, hoje: string): number {
  const [y, m] = yearMonth.split('-').map(Number);
  const [hy, hm, hd] = hoje.split('-').map(Number);
  if (hy < y || (hy === y && hm < m)) return 0;
  if (hy === y && hm === m) return Math.max(0, hd - 1);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Cobertura diária: `done` nunca passa dos dias decorridos (um mês preenchido adiantado não rende mais que 100%). */
export function cobertura(diasComLancamento: number, decorridos: number): { done: number; missed: number } {
  const done = Math.min(Math.max(0, diasComLancamento), decorridos);
  return { done, missed: Math.max(0, decorridos - done) };
}

/**
 * Quantos DIAS DISTINTOS do mês (até o dia `decorridos`) aparecem numa lista de
 * dias 'AAAA-MM-DD'. Serve para o cofre (movimentos com hora, convertidos para
 * o dia de Brasília) e para a Escala (datas ao meio-dia UTC → dia UTC).
 */
export function diasDistintosNoMes(dias: string[], yearMonth: string, decorridos: number): number {
  const vistos = new Set<string>();
  for (const d of dias) {
    if (!d.startsWith(yearMonth + '-')) continue;
    if (Number(d.slice(8, 10)) > decorridos) continue;
    vistos.add(d);
  }
  return vistos.size;
}
