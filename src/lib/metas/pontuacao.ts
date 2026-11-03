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

export type StatusDoComponente = 'DESENVOLVIMENTO' | 'HOMOLOGACAO' | 'MONITORAMENTO' | 'ATIVO';

export interface ComponenteDaMeta {
  /** Chave do módulo na matriz (TASKS, WASTE, CASH…). */
  key: string;
  name: string;
  weight: number;
  done: number;
  missed: number;
  /**
   * v1.180.0 — só ATIVO entra na nota; HOMOLOGACAO/MONITORAMENTO são medidos e
   * mostrados "em observação"; DESENVOLVIMENTO nem aparece. Ausente = ativo
   * (listas antigas e testes). Status e peso são INDEPENDENTES: peso > 0 com
   * status fora não conta.
   */
  status?: StatusDoComponente;
  /**
   * v1.181.0 — o % já resolvido, quando não é `done ÷ resolvido`: a auditoria de
   * atestados entra com `100 − penalização da faixa` (peso 10 com < 80% de
   * conformidade = 5 pontos). `done`/`missed` continuam valendo para "há algo
   * resolvido" e para a leitura (3 conformes / 1 falha).
   */
  scorePct?: number;
}
/** O % de um componente: o pronto, se veio; senão feito ÷ resolvido. */
export function pctDoComponente(c: { done: number; missed: number; scorePct?: number }): number {
  const resolved = c.done + c.missed;
  if (c.scorePct != null) return Math.max(0, Math.min(100, c.scorePct));
  return resolved > 0 ? Math.round((c.done / resolved) * 100) : 0;
}
/** Entra na conta? Sem status = sim (compatibilidade). */
export const contaNaNota = (c: { status?: StatusDoComponente }) => !c.status || c.status === 'ATIVO';
export const emObservacao = (c: { status?: StatusDoComponente }) => c.status === 'HOMOLOGACAO' || c.status === 'MONITORAMENTO';

export interface DescontoDaMeta {
  name: string;
  /** Ocorrências que descontam (datas corrigidas, gerentes sem folga…). */
  quantidade: number;
  /** % descontado por ocorrência. */
  pct: number;
  /** v1.180.0 — o que descontou, nomeado (quem está sem folga, quantas datas corrigidas). */
  detalhe?: string;
}

export interface Pontuacao { scorePct: number; doneWeight: number; resolvedWeight: number }

export function pontuar(componentes: ComponenteDaMeta[], descontos: DescontoDaMeta[] = []): Pontuacao {
  let doneWeight = 0;
  let resolvedWeight = 0;
  for (const c of componentes) {
    const resolved = c.done + c.missed;
    if (resolved <= 0 || c.weight <= 0 || !contaNaNota(c)) continue;
    resolvedWeight += c.weight;
    doneWeight += c.weight * (c.scorePct != null ? Math.max(0, Math.min(100, c.scorePct)) / 100 : c.done / resolved);
  }
  let scorePct = resolvedWeight === 0 ? 0 : Math.round((doneWeight / resolvedWeight) * 100);
  for (const d of descontos) {
    if (d.quantidade > 0 && d.pct > 0) scorePct = Math.max(0, Math.round(scorePct - d.quantidade * d.pct));
  }
  return { scorePct, doneWeight, resolvedWeight };
}

export interface LinhaDeComponente { name: string; weight: number; done: number; resolved: number; scorePct: number }

/** As linhas do detalhamento: só o que de fato pesou (ATIVO, peso > 0 e algo resolvido), do maior peso para o menor. */
export function linhasDosComponentes(componentes: ComponenteDaMeta[]): LinhaDeComponente[] {
  return componentes
    .filter((c) => contaNaNota(c) && c.weight > 0 && c.done + c.missed > 0)
    .map((c) => ({ name: c.name, weight: c.weight, done: c.done, resolved: c.done + c.missed, scorePct: pctDoComponente(c) }))
    .sort((a, b) => b.weight - a.weight);
}

export interface LinhaEmObservacao extends LinhaDeComponente {
  key: string;
  status: StatusDoComponente;
  /** Em HOMOLOGAÇÃO: a nota que a unidade teria se este componente contasse (com o peso dele). Nula sem peso. */
  notaSeContasse: number | null;
}

/**
 * v1.180.0 — os componentes EM OBSERVAÇÃO (homologação/monitoramento) com algo
 * medido no mês: aparecem no detalhamento, não entram na nota. Em homologação,
 * a nota simulada responde "o que mudaria se este componente estivesse ativo".
 */
export function linhasEmObservacao(componentes: ComponenteDaMeta[], descontos: DescontoDaMeta[] = []): LinhaEmObservacao[] {
  return componentes
    .filter((c) => emObservacao(c) && c.done + c.missed > 0)
    .map((c) => ({
      key: c.key, name: c.name, weight: c.weight, done: c.done, resolved: c.done + c.missed,
      scorePct: pctDoComponente(c),
      status: c.status as StatusDoComponente,
      notaSeContasse: c.status === 'HOMOLOGACAO' && c.weight > 0
        ? pontuar(componentes.map((x) => (x.key === c.key ? { ...x, status: 'ATIVO' as const } : x)), descontos).scorePct
        : null,
    }))
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name, 'pt-BR'));
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
