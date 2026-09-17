import { cookies } from 'next/headers';
import { UNIT_COOKIE, TODA_A_REDE } from './unit-context';

/**
 * Unidade "em contexto" do usuário (seletor global no header).
 *
 * Devolve o id de uma unidade, `TODA_A_REDE` ou `null` (sem unidade nenhuma).
 * Quem consome passa isto a `resolveUnitFilter`, que sabe traduzir os três.
 *
 * ⚠️ A ESCOLHA DO PADRÃO importa: antes, sem cookie, isto devolvia a PRIMEIRA
 * unidade da lista. Quem responde pela rede abria o sistema já filtrado numa
 * unidade escolhida por ordem alfabética, sem ter pedido — e sem opção de
 * "toda a rede" no seletor, não havia como sair. Com mais de uma unidade no
 * alcance, o padrão passa a ser a REDE; com uma só, ela mesma.
 */
export function getSelectedUnitId(scopedUnitIds: string[]): string | null {
  if (scopedUnitIds.length === 0) return null;
  if (scopedUnitIds.length === 1) return scopedUnitIds[0];
  const c = cookies().get(UNIT_COOKIE)?.value;
  if (c === TODA_A_REDE) return TODA_A_REDE;
  if (c && scopedUnitIds.includes(c)) return c;
  return TODA_A_REDE;
}
