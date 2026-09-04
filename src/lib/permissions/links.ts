import { effectivePermissions } from '@/lib/permissions';
import { moduleOfPath } from '@/lib/permissions/route-guard';
import type { Role } from '@prisma/client';

/**
 * "Este perfil pode abrir este endereço?" — para a tela não oferecer link que a
 * guarda de rota vai recusar.
 *
 * Fechar uma parte na matriz e deixar o atalho na tela dá o pior dos dois
 * mundos: a pessoa clica e volta para onde estava, sem entender. Como a regra
 * de dono do caminho é a mesma da guarda (`moduleOfPath`), tela e servidor não
 * podem discordar.
 *
 * Carrega a matriz UMA vez e devolve uma função síncrona — chamar por link
 * daria uma consulta ao banco por atalho desenhado.
 */
export async function permissaoDeRota(role: Role): Promise<(href: string) => boolean> {
  const perms = await effectivePermissions(role);
  return (href: string) => {
    const key = moduleOfPath(href.split('?')[0]);
    return !key || Boolean(perms[key]?.canView);
  };
}
