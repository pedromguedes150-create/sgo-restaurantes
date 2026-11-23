/**
 * FREELANCER SÓ NO DIA (v1.221.0) — regra PURA, lida pela tela e pelo servidor.
 *
 * Pedido do Daniel (23/11/2026): gerentes vinham lançando freelancer com data
 * passada. O lançamento passa a valer só para o DIA: quem não é Administrador
 * não escolhe data — o "dia do trabalho" é hoje.
 *
 * "Hoje" são dois dias possíveis, e os dois valem:
 *  - o dia civil de Brasília;
 *  - o dia operacional da unidade (corte às 04:00): quem lança à 1h da manhã
 *    o freelancer do turno que acabou de virar a noite ainda está no dia
 *    operacional anterior.
 * Data futura e qualquer outro dia passado são recusados.
 *
 * O Administrador lança qualquer dia (é a porta para corrigir um esquecimento).
 * A correção do aprovador antes de aprovar NÃO passa por aqui: ela segue como
 * estava (Supervisão/Coordenação ajustam o dia de um pedido já lançado).
 */

/** Quem lança freelancer em dia que não é o de hoje. */
export function podeLancarFreelancerEmOutroDia(role: string): boolean {
  return role === 'ADMIN';
}

/** Os dias que valem como "hoje": o civil e o operacional, sem repetir, o civil primeiro. */
export function diasDeHoje(hojeCivil: string, diaOperacional: string): string[] {
  return hojeCivil === diaOperacional ? [hojeCivil] : [hojeCivil, diaOperacional];
}

export function diaDoFreelancerAceito(role: string, workDate: string, hojeCivil: string, diaOperacional: string): boolean {
  if (podeLancarFreelancerEmOutroDia(role)) return true;
  return diasDeHoje(hojeCivil, diaOperacional).includes(workDate);
}

export const MENSAGEM_SO_NO_DIA = 'O freelancer é lançado no próprio dia do trabalho. Para lançar outro dia, peça ao Administrador.';
