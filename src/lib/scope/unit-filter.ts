import { parseUnitParam } from './unit-param';

/** Valor explícito de "sem filtro" na URL: `?unit=todas`. */
export const TODAS_AS_UNIDADES = 'todas';

export interface UnitFilter {
  ids: string[];
  /** Está mostrando todas as unidades acessíveis. */
  all: boolean;
  /** De onde veio a decisão — só para explicar na tela, nunca para escopo. */
  source: 'param' | 'seletor' | 'todas';
}

/**
 * Qual unidade a tela deve mostrar.
 *
 * Existe porque o app tinha DOIS filtros de unidade que não se falavam: o
 * seletor global do cabeçalho grava `?unidade=` + cookie, e as telas antigas
 * liam só `?unit=` (o parâmetro que o Dashboard usa nos atalhos). O cabeçalho
 * dizia "Moreira" e a lista mostrava a rede inteira — e voltar de uma tarefa
 * parecia "perder" a unidade que nunca esteve aplicada de verdade.
 *
 * Precedência, do mais explícito para o mais implícito:
 *
 * 1. `?unit=todas` — o usuário pediu para ver todas, e isso vence o seletor.
 * 2. `?unit=<ids>` — filtro explícito da tela (atalhos do Dashboard, links
 *    internos). Aceita vários ids separados por vírgula.
 * 3. `?unidade=<id>` — o seletor global, refletido na URL.
 * 4. Cookie do seletor (`selectedUnitId`), que é o que o chip do cabeçalho
 *    mostra. É o padrão: a tela obedece o que está escrito lá em cima.
 *
 * Ids fora do alcance do usuário são ignorados aqui, mas quem garante o escopo
 * é o `unitScopeWhere` no banco (regra nº 3) — isto é filtro de tela, não
 * autorização.
 */
export function resolveUnitFilter(
  raw: { unit?: string; unidade?: string },
  accessibleIds: string[],
  selectedUnitId: string | null,
): UnitFilter {
  const todas: UnitFilter = { ids: accessibleIds, all: true, source: 'todas' };
  if (accessibleIds.length === 0) return todas;

  const pedido = (raw.unit ?? '').trim();
  if (pedido.toLowerCase() === TODAS_AS_UNIDADES) return todas;

  if (pedido) {
    const p = parseUnitParam(pedido, accessibleIds);
    return { ...p, source: p.all ? 'todas' : 'param' };
  }

  const doSeletor = (raw.unidade ?? '').trim() || selectedUnitId || '';
  if (doSeletor && accessibleIds.includes(doSeletor)) {
    /* Uma unidade só no alcance: filtrar por ela é o mesmo que ver todas, e
       dizer "filtrado" faria a tela oferecer um "ver todas" que não muda nada. */
    if (accessibleIds.length === 1) return todas;
    return { ids: [doSeletor], all: false, source: 'seletor' };
  }

  return todas;
}
