/**
 * AUDITORIA DE ATESTADOS (v1.181.0) — as regras, sem banco.
 *
 * O que se audita NÃO é o atestado: é o LANÇAMENTO dele no SGO pelo gerente.
 * RH ou supervisão informam o atestado ESPERADO (colaborador, unidade,
 * período, quando o gerente soube); o SGO cruza com o que foi lançado e diz,
 * por esperado, a situação:
 *
 *   NO_PRAZO          — ainda dentro do prazo, sem lançamento (nada a cobrar)
 *   CONFORME          — lançado até o prazo (automático: fato contra fato)
 *   EM_CONFERENCIA    — prazo vencido sem lançamento, ou lançado DEPOIS do
 *                       prazo: a supervisão ainda não validou. NÃO prejudica a
 *                       nota (ajuste 3 do Pedro: só falha CONFIRMADA conta)
 *   FALHA_CONFIRMADA  — a supervisão confirmou a falha (prazo vencido, sem
 *                       justificativa aprovada)
 *   JUSTIFICADO       — justificativa do gerente aprovada pela supervisão:
 *                       conta como conforme
 *   INVALIDO          — o esperado não procedia (informação errada do RH,
 *                       colaborador afastado por outro motivo…): fora da conta
 *
 * Conformidade do mês = (conformes + justificados) ÷ (conformes + justificados
 * + falhas confirmadas). Sem base (nenhum esperado decidido) = NEUTRO.
 *
 * Penalização por FAIXA, sobre o PESO do componente (ajuste 1 do Pedro):
 * 100% sem desconto · 90–99,9% perde 10% · 80–89,9% perde 25% · < 80% perde
 * 50%. O componente entra na composição com `scorePct = 100 − penalização`,
 * então peso 10 com conformidade < 80% rende 10 × 50% = 5 pontos — o peso
 * original não muda.
 */

export type SituacaoDaAuditoria = 'NO_PRAZO' | 'CONFORME' | 'EM_CONFERENCIA' | 'FALHA_CONFIRMADA' | 'JUSTIFICADO' | 'INVALIDO';
/** O que a supervisão GRAVA (o resto é derivado). */
export type RevisaoDaAuditoria = 'AGUARDANDO' | 'FALHA_CONFIRMADA' | 'JUSTIFICADO' | 'INVALIDO';

export const ROTULO_SITUACAO: Record<SituacaoDaAuditoria, string> = {
  NO_PRAZO: 'No prazo (aguardando lançamento)',
  CONFORME: 'Conforme',
  EM_CONFERENCIA: 'Em conferência',
  FALHA_CONFIRMADA: 'Falha confirmada',
  JUSTIFICADO: 'Justificado',
  INVALIDO: 'Inválido',
};
export const TOM_SITUACAO: Record<SituacaoDaAuditoria, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  NO_PRAZO: 'info', CONFORME: 'success', EM_CONFERENCIA: 'warning', FALHA_CONFIRMADA: 'danger', JUSTIFICADO: 'success', INVALIDO: 'neutral',
};

/** Quem informa o esperado e quem valida (RH = Admin; supervisão; coordenação). */
export const PODE_AUDITAR = ['ADMIN', 'CEO', 'SUPERVISOR', 'COORDINATOR'] as const;
export const podeAuditar = (role: string) => (PODE_AUDITAR as readonly string[]).includes(role);
/** Quem justifica: o gerente da unidade e a própria linha supervisora. */
export const podeJustificar = (role: string) => role === 'MANAGER' || podeAuditar(role);

export const PRAZO_HORAS_PADRAO = 24;
export interface Faixa { /** Conformidade mínima (inclusive) para a faixa. */ min: number; /** % do PESO perdido. */ penalizacao: number }
export const FAIXAS_PADRAO: Faixa[] = [
  { min: 100, penalizacao: 0 },
  { min: 90, penalizacao: 10 },
  { min: 80, penalizacao: 25 },
  { min: 0, penalizacao: 50 },
];
/** As faixas a partir dos três percentuais configuráveis (90–99,9 · 80–89,9 · abaixo de 80). */
export function montarFaixas(p: { pen90: number; pen80: number; penAbaixo80: number }): Faixa[] {
  return [{ min: 100, penalizacao: 0 }, { min: 90, penalizacao: p.pen90 }, { min: 80, penalizacao: p.pen80 }, { min: 0, penalizacao: p.penAbaixo80 }];
}
export function penalizacaoDaFaixa(conformidadePct: number, faixas: Faixa[] = FAIXAS_PADRAO): number {
  const ordenadas = [...faixas].sort((a, b) => b.min - a.min);
  for (const f of ordenadas) if (conformidadePct >= f.min) return Math.max(0, Math.min(100, f.penalizacao));
  return ordenadas[ordenadas.length - 1]?.penalizacao ?? 0;
}
/** O % que o componente leva para a composição: 100 − penalização (peso 10 × 50% = 5 pontos). */
export const pontosDoComponente = (conformidadePct: number, faixas: Faixa[] = FAIXAS_PADRAO) => 100 - penalizacaoDaFaixa(conformidadePct, faixas);

/** Dia civil 'AAAA-MM-DD' em Brasília. */
export function diaEmBrasilia(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
/** 0 = domingo … 6 = sábado, do dia civil 'AAAA-MM-DD'. */
export function diaDaSemana(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export interface CalendarioUtil { feriados: Set<string>; /** Domingo não conta (padrão sim: a unidade fecha ou roda reduzida). */ pulaDomingo?: boolean }
/** O dia conta como ÚTIL para o prazo? Feriado cadastrado e domingo não contam. */
export function diaUtil(iso: string, cal: CalendarioUtil): boolean {
  if (cal.feriados.has(iso)) return false;
  if ((cal.pulaDomingo ?? true) && diaDaSemana(iso) === 0) return false;
  return true;
}

/**
 * Prazo de lançamento: `horasUteis` horas a partir da ciência, contando só as
 * horas que caem em dia útil (Brasília). Caminha de hora em hora — são 24 a
 * 72 horas, e andar hora a hora é o que torna a regra legível e testável.
 */
export function prazoDeLancamento(cienciaEm: Date, horasUteis: number, cal: CalendarioUtil): Date {
  const horas = Math.max(0, Math.trunc(horasUteis));
  let t = cienciaEm.getTime();
  let contadas = 0;
  let guarda = 0;
  while (contadas < horas && guarda < 24 * 60) {
    t += 3_600_000;
    guarda++;
    if (diaUtil(diaEmBrasilia(new Date(t)), cal)) contadas++;
  }
  return new Date(t);
}

export interface EsperadoParaSituacao {
  reviewStatus: RevisaoDaAuditoria;
  /** `createdAt` do atestado cruzado (quando o gerente lançou), ou nulo. */
  lancadoEm: Date | null;
  prazoAte: Date;
}
export function situacaoDoEsperado(e: EsperadoParaSituacao, agora: Date): SituacaoDaAuditoria {
  if (e.reviewStatus !== 'AGUARDANDO') return e.reviewStatus;
  if (e.lancadoEm) return e.lancadoEm.getTime() <= e.prazoAte.getTime() ? 'CONFORME' : 'EM_CONFERENCIA';
  return agora.getTime() > e.prazoAte.getTime() ? 'EM_CONFERENCIA' : 'NO_PRAZO';
}
/** A supervisão só confirma falha com o prazo vencido e sem lançamento no prazo. */
export function podeConfirmarFalha(e: EsperadoParaSituacao, agora: Date): boolean {
  return situacaoDoEsperado({ ...e, reviewStatus: 'AGUARDANDO' }, agora) === 'EM_CONFERENCIA';
}

export interface Conformidade {
  esperados: number;
  conformes: number;
  justificados: number;
  falhas: number;
  emConferencia: number;
  noPrazo: number;
  invalidos: number;
  /** conformes + justificados + falhas — o que já foi decidido. */
  base: number;
  /** Nulo = neutro (nada decidido no mês). */
  pct: number | null;
}
export function conformidade(situacoes: SituacaoDaAuditoria[]): Conformidade {
  const n = (s: SituacaoDaAuditoria) => situacoes.filter((x) => x === s).length;
  const conformes = n('CONFORME'); const justificados = n('JUSTIFICADO'); const falhas = n('FALHA_CONFIRMADA');
  const base = conformes + justificados + falhas;
  return {
    esperados: situacoes.length, conformes, justificados, falhas, emConferencia: n('EM_CONFERENCIA'), noPrazo: n('NO_PRAZO'), invalidos: n('INVALIDO'),
    base, pct: base ? Math.round(((conformes + justificados) / base) * 1000) / 10 : null,
  };
}

/**
 * O componente da meta a partir da conformidade: `done` = o que ficou bem,
 * `missed` = falhas confirmadas, `scorePct` = pontos da faixa (100 − penalização).
 * Sem base → 0/0, que `pontuar` deixa FORA da conta (neutro).
 */
export function componenteDeAtestados(c: Conformidade, faixas: Faixa[] = FAIXAS_PADRAO): { done: number; missed: number; scorePct: number; penalizacao: number } {
  if (c.pct == null) return { done: 0, missed: 0, scorePct: 0, penalizacao: 0 };
  const penalizacao = penalizacaoDaFaixa(c.pct, faixas);
  return { done: c.conformes + c.justificados, missed: c.falhas, scorePct: 100 - penalizacao, penalizacao };
}

/** Dois períodos 'AAAA-MM-DD' se tocam? */
export const sobrepoe = (a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }) => a.startDate <= b.endDate && b.startDate <= a.endDate;

export const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MOTIVO_MIN = 10;
