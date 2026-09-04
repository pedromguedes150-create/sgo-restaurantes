import { effectivePermissions } from '@/lib/permissions';
import { acessoDasAbas, type AcessoAbas } from '@/lib/permissions/abas';
import type { Role } from '@prisma/client';

/**
 * As abas liberadas de um módulo para um perfil — o que a tela precisa saber
 * para não desenhar aba que o servidor vai recusar.
 */
export async function abasDoPerfil(role: Role, modulo: string): Promise<AcessoAbas> {
  return acessoDasAbas(await effectivePermissions(role), modulo);
}
