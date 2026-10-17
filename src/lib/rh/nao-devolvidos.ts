/**
 * NÃO DEVOLVIDOS PELO RH — conferência na base inteira (v1.171.0).
 *
 * Regra deste arquivo: nenhum import. É a decisão PURA; o sync aplica.
 *
 * O problema: a lista da UNIDADE deixa de devolver alguém (a Julia, desligada)
 * e a pessoa fica ativa no SGO — aparece na grade da Escala com "T" o mês
 * inteiro. A resposta antiga ("quem não veio é inativado") marcou 49 pessoas
 * inativas em 29/09/2026 numa resposta incompleta do RH, e foi removida.
 *
 * A saída (decisão do Pedro, 16/10/2026): distinguir "o RH DISSE que saiu" de
 * "o RH só não respondeu". Quem a unidade não devolveu é procurado na BASE
 * INTEIRA do RH, pela matrícula:
 *  - achada com status de desligamento → inativa na hora (é o status do RH);
 *  - achada ativa em OUTRA razão social → transferência: sai do vínculo desta
 *    unidade (e entra na outra, se for do SGO);
 *  - achada ativa numa razão social DESTA unidade → a lista da unidade é que
 *    veio incompleta; nada muda;
 *  - não achada em lugar nenhum → só conta: inativa depois de
 *    `RODADAS_PARA_INATIVAR` DIAS distintos ausente, e nunca mais do que
 *    `TETO_INATIVACAO_POR_AUSENCIA` dos ativos da unidade numa rodada.
 * Base geral inválida (erro, formato, vazia) → não se conta o dia: uma
 * resposta ruim não pode aproximar ninguém do desligamento.
 */

export const RODADAS_PARA_INATIVAR = 3;
export const TETO_INATIVACAO_POR_AUSENCIA = 0.3;

export interface PessoaNaBaseGeral {
  matricula: string;
  status: string | null;
  unidade: string | null;
}

export type SituacaoNaBaseGeral =
  | { tipo: 'DESLIGADO_NO_RH'; status: string }
  | { tipo: 'TRANSFERIDO'; razao: string; status: string }
  | { tipo: 'PRESENTE'; razao: string }
  | { tipo: 'AUSENTE' };

/**
 * O que a base inteira diz de uma matrícula que a unidade não devolveu.
 * `desligado(status)` é a classificação do SGO (`isAtivo` invertido), passada
 * de fora para este arquivo continuar sem import.
 */
export function situacaoNaBaseGeral(
  matricula: string,
  baseGeral: Map<string, PessoaNaBaseGeral>,
  razoesDaUnidade: Set<string>,
  desligado: (status: string | null) => boolean,
): SituacaoNaBaseGeral {
  const p = baseGeral.get(matricula);
  if (!p) return { tipo: 'AUSENTE' };
  const status = (p.status ?? '').trim();
  if (desligado(p.status)) return { tipo: 'DESLIGADO_NO_RH', status };
  const razao = (p.unidade ?? '').trim();
  if (razao && razoesDaUnidade.has(razao)) return { tipo: 'PRESENTE', razao };
  if (razao) return { tipo: 'TRANSFERIDO', razao, status };
  /* Ativa e sem razão social: o RH não disse onde ela está. Tratar como
     presente seria afirmar cobertura; como ausente, aproximar do desligamento
     sem o RH ter dito nada. Fica contando como ausente — a base geral VÁLIDA
     disse que ela existe, mas não para esta unidade. */
  return { tipo: 'AUSENTE' };
}

export interface ContagemDeAusencia {
  since: string | null;
  lastDay: string | null;
  days: number;
}

/**
 * Mais um dia ausente. Duas sincronizações no mesmo dia (manual + automática)
 * contam UMA — é por dias distintos, não por cliques. Devolve o estado novo e
 * se a ausência já está confirmada.
 */
export function contarAusencia(prev: ContagemDeAusencia, hojeISO: string): ContagemDeAusencia & { confirmada: boolean } {
  const since = prev.since ?? hojeISO;
  const jaContouHoje = prev.lastDay === hojeISO;
  const days = Math.max(prev.days, 0) + (jaContouHoje ? 0 : 1);
  return { since, lastDay: hojeISO, days, confirmada: days >= RODADAS_PARA_INATIVAR };
}

/** Voltou a aparecer (na unidade ou na base geral): a contagem zera. */
export const SEM_AUSENCIA: ContagemDeAusencia = { since: null, lastDay: null, days: 0 };

/**
 * Trava de segurança: numa rodada, inativar por AUSÊNCIA mais do que 30% dos
 * ativos da unidade é o cenário dos 49 — não inativa ninguém e avisa. Com 2
 * ativos, 1 passa (teto = ⌈0,6⌉ = 1) e 2 não.
 */
export function travaDeSeguranca(candidatos: number, ativosDaUnidade: number): boolean {
  if (candidatos === 0) return false;
  const teto = Math.ceil(ativosDaUnidade * TETO_INATIVACAO_POR_AUSENCIA);
  return candidatos > teto;
}

/** Motivos gravados em `Collaborator.inactiveReason`. */
export const MOTIVO_INATIVACAO = {
  RH_STATUS: 'RH_STATUS',
  RH_STATUS_BASE_GERAL: 'RH_STATUS_BASE_GERAL',
  RH_AUSENTE_CONFIRMADO: 'RH_AUSENTE_CONFIRMADO',
  RH_EVENTO: 'RH_EVENTO',
  MANUAL: 'MANUAL',
} as const;

export const MOTIVO_INATIVACAO_ROTULO: Record<string, string> = {
  RH_STATUS: 'Desligado no RH (lista da unidade)',
  RH_STATUS_BASE_GERAL: 'Desligado no RH (base geral)',
  RH_AUSENTE_CONFIRMADO: `Sumiu da base do RH por ${RODADAS_PARA_INATIVAR} dias`,
  RH_EVENTO: 'Desligamento enviado pelo RH',
  MANUAL: 'Inativado à mão',
};

/* ───────────── A grade da Escala ───────────── */

/**
 * A pessoa inativa aparece na grade do mês em que saiu, até o dia da saída;
 * nos meses seguintes, não. `inactiveSince` nulo (inativação antiga, sem
 * data) = some como sempre sumiu.
 */
export function apareceNaGrade(c: { active: boolean; inactiveSince: string | null }, primeiroDiaDoMesISO: string): boolean {
  if (c.active) return true;
  return Boolean(c.inactiveSince && c.inactiveSince >= primeiroDiaDoMesISO);
}

/** O dia está depois da saída? (célula em cinza, sem status) */
export function diaDepoisDaSaida(inactiveSince: string | null, diaISO: string): boolean {
  return Boolean(inactiveSince && diaISO >= inactiveSince);
}
