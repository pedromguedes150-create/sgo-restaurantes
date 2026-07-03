/**
 * Interpreta o parâmetro de filtro de unidade da URL (padrão `unit`, separado por
 * vírgula) contra as unidades acessíveis do usuário. Vazio/ausente = TODAS as
 * acessíveis. Ignora ids que o usuário não pode ver (escopo no servidor).
 * Retorna { ids, all } — `all` = está mostrando todas (sem filtro efetivo).
 */
export function parseUnitParam(raw: string | undefined, accessibleIds: string[]): { ids: string[]; all: boolean } {
  const access = new Set(accessibleIds);
  if (!raw) return { ids: accessibleIds, all: true };
  const picked = raw.split(',').map((s) => s.trim()).filter((s) => s && access.has(s));
  if (picked.length === 0 || picked.length === accessibleIds.length) return { ids: accessibleIds, all: true };
  return { ids: picked, all: false };
}
