import { MODULES, isFullAccess, effectivePermissions } from '@/lib/permissions';
import type { Role } from '@prisma/client';

/**
 * Guarda de rota por módulo — a checagem que faltava no servidor.
 *
 * A matriz de perfis (Configurações → Perfis de acesso) só escondia o item no
 * MENU. Nada impedia de abrir a tela digitando o endereço: um perfil Caixa, que
 * existe só para bipar comandas, alcançava /modulos/executivo, /modulos/pessoas
 * (CPF e PIX) e /modulos/atestados (CID, dado sensível de LGPD) escrevendo a URL.
 * Esconder no menu é conveniência; bloquear no servidor é controle de acesso.
 *
 * O escopo por unidade JÁ era verificado no servidor em cada consulta — o furo
 * era só o de módulo.
 */

/** Módulo dono de um caminho: o `nav` mais LONGO que prefixa o caminho. */
export function moduleOfPath(pathname: string): string | null {
  let melhor: { key: string; len: number } | null = null;
  for (const m of MODULES) {
    if (!m.nav) continue;
    if (pathname === m.nav || pathname.startsWith(m.nav + '/')) {
      if (!melhor || m.nav.length > melhor.len) melhor = { key: m.key, len: m.nav.length };
    }
  }
  return melhor?.key ?? null;
}

/**
 * Para onde mandar quem bateu numa porta fechada.
 *
 * Nunca devolve uma rota que o próprio perfil não pode ver — senão o
 * redirecionamento cai na guarda de novo e vira laço. O Caixa vai direto para a
 * bipagem, que é a única coisa que ele faz.
 */
export async function homeForRole(role: Role): Promise<string> {
  if (role === 'CASHIER') return '/modulos/comandas/conferencia';
  const perms = await effectivePermissions(role);
  const primeiro = MODULES.find((m) => m.nav && perms[m.key]?.canView);
  return primeiro?.nav ?? '/ajuda';
}

/** O perfil pode abrir este caminho? */
export async function canOpenPath(role: Role, pathname: string): Promise<boolean> {
  if (isFullAccess(role)) return true;
  const key = moduleOfPath(pathname);
  if (!key) return true; // fora do mapa (ex.: /perfil, /notificacoes): regra própria da tela
  const perms = await effectivePermissions(role);
  return Boolean(perms[key]?.canView);
}
