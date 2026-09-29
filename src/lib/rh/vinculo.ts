import type { RhColaborador } from '@/lib/rh/normalize';

/**
 * VÍNCULO unidade do SGO ↔ empresa do RH — a parte PURA (v1.132.0).
 *
 * O RH devolve, em cada colaborador, a razão social (`unidade`) e o CNPJ
 * (`unidade_cnpj`). O SGO tem os dois no cadastro da unidade. A regra:
 *   1. CNPJ, quando a unidade tem um válido e o RH devolve gente com ele;
 *   2. senão, a razão social em `Unit.rhUnitName` — o vínculo de sempre.
 *
 * Empresas do RH que não casam com unidade nenhuma são simplesmente ignoradas:
 * o RH pode ter X empresas e este SGO cuida de um subconjunto delas.
 */

/** Só dígitos; CNPJ precisa ter 14. Qualquer outra coisa é "sem CNPJ". */
export function normalizarCnpj(v: string | null | undefined): string | null {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.length === 14 ? d : null;
}

export function filtrarPorCnpj(lista: RhColaborador[], cnpj: string): RhColaborador[] {
  const alvo = normalizarCnpj(cnpj);
  if (!alvo) return [];
  return lista.filter((c) => normalizarCnpj(c.unidade_cnpj) === alvo);
}

/**
 * Razão social comparável: sem acento, sem caixa, sem espaço sobrando. "LTDA (CENTRO)"
 * e "Ltda  (Centro)" são a mesma empresa; "&" e parênteses ficam como estão.
 */
export function normalizarRazaoSocial(s: string | null | undefined): string {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

/**
 * Fallback por razão social FEITO NO SGO, sobre a lista completa do RH — e não
 * por um caminho `/unidade/<razão social>` montado na URL. Foi um caminho
 * assim, com "(CENTRO DE DISTRIBUIÇÃO)" sem codificar, que a validação da
 * Central recusou como "Caminho inválido" (503) na v1.132.0. Nome de empresa
 * não é lugar para viver numa URL.
 */
export function filtrarPorRazaoSocial(lista: RhColaborador[], razaoSocial: string): RhColaborador[] {
  const alvo = normalizarRazaoSocial(razaoSocial);
  if (!alvo) return [];
  return lista.filter((c) => normalizarRazaoSocial(c.unidade) === alvo);
}

export type Vinculo = 'CNPJ' | 'RAZAO_SOCIAL';

/**
 * Decide como esta unidade se liga ao RH, dado o que ela tem cadastrado e o
 * que o RH devolveu. `porCnpj` é a lista já filtrada pelo CNPJ da unidade (ou
 * null quando a unidade não tem CNPJ válido).
 */
export function decidirVinculo(u: { cnpj: string | null; rhUnitName: string | null }, porCnpj: RhColaborador[] | null): { vinculo: Vinculo } | { vinculo: null; motivo: 'SEM_VINCULO' } {
  if (porCnpj && porCnpj.length > 0) return { vinculo: 'CNPJ' };
  if (u.rhUnitName) return { vinculo: 'RAZAO_SOCIAL' };
  if (normalizarCnpj(u.cnpj)) return { vinculo: 'CNPJ' };
  return { vinculo: null, motivo: 'SEM_VINCULO' };
}
