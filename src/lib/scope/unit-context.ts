// Constantes do seletor global de unidade (Onda 1). Módulo client-safe:
// NÃO importa next/headers, então pode ser usado por componentes client.
export const UNIT_COOKIE = 'sgo_unit';
export const UNIT_PARAM = 'unidade';

/**
 * O valor de "toda a rede" no seletor global.
 *
 * É o MESMO texto que `?unit=todas` já usava nas telas (`TODAS_AS_UNIDADES` em
 * `scope/unit-filter.ts`), de propósito: a URL que um atalho do painel gera e o
 * cookie que o seletor grava passam a falar a mesma língua. Dois nomes para a
 * mesma ideia seriam duas regras para manter iguais.
 */
export const TODA_A_REDE = 'todas';
