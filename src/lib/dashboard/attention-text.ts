/**
 * Frase do alerta de Ocorrências no "Precisa da sua atenção".
 *
 * Existe como função porque a frase era montada juntando dois pedaços, e só o
 * PRIMEIRO nomeava o assunto:
 *
 *     `${criticas} ocorrência(s) crítica(s) aberta(s)` · `${over48} aberta(s) há mais de 48h`
 *
 * Com zero críticas — o caso comum — sobrava "141 aberta(s) há mais de 48h.",
 * uma frase sem sujeito no cartão mais visível do sistema. Aberta o quê?
 */
export function textoDeOcorrencias(criticalOpen: number, openOver48h: number): string | null {
  const criticas = Math.max(0, Math.trunc(criticalOpen || 0));
  const antigas = Math.max(0, Math.trunc(openOver48h || 0));
  if (criticas === 0 && antigas === 0) return null;

  /* O assunto vai no primeiro trecho que existir; o segundo herda dele e fica
     curto, para não repetir "ocorrência(s)" duas vezes na mesma linha. */
  if (criticas > 0 && antigas > 0) {
    return `${criticas} ocorrência(s) crítica(s) aberta(s) · ${antigas} aberta(s) há mais de 48h.`;
  }
  if (criticas > 0) return `${criticas} ocorrência(s) crítica(s) aberta(s).`;
  return `${antigas} ocorrência(s) aberta(s) há mais de 48h.`;
}
