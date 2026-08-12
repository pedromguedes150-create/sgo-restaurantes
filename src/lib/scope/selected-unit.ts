import { cookies } from 'next/headers';
import { UNIT_COOKIE } from './unit-context';

/**
 * Unidade "em contexto" do usuário (seletor global no header, Onda 1).
 * Persistida em cookie e refletida na URL (?unidade=). Server helper: valida
 * contra as unidades no escopo do usuário; fallback na primeira.
 * Os módulos passam a consumir isto ao serem redesenhados (Ondas 3-5).
 * Constantes (client-safe) em ./unit-context.
 */
export function getSelectedUnitId(scopedUnitIds: string[]): string | null {
  if (scopedUnitIds.length === 0) return null;
  const c = cookies().get(UNIT_COOKIE)?.value;
  if (c && scopedUnitIds.includes(c)) return c;
  return scopedUnitIds[0];
}
