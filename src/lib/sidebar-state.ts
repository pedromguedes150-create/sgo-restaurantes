/**
 * Estado de recolhimento da sidebar (desktop, lg+).
 *
 * Vive num cookie — e não em localStorage — para que o SERVIDOR já renderize a
 * largura certa. Com localStorage a sidebar apareceria expandida e só pularia
 * para recolhida depois da hidratação, piscando a cada reload.
 *
 * O cookie NÃO é httpOnly de propósito: quem escreve é o próprio clique no
 * botão (client component), sem round-trip de rede. Não é dado sensível.
 */

export const SIDEBAR_COOKIE = 'sgo_sidebar';

/** 1 ano — é preferência de interface, não faz sentido expirar antes. */
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type SidebarState = 'collapsed' | 'expanded';

/**
 * Só o valor exato 'collapsed' recolhe. Ausente, vazio ou inválido = expandida,
 * que é o comportamento de quem nunca tocou no botão.
 */
export function isSidebarCollapsed(value: string | undefined | null): boolean {
  return value === 'collapsed';
}

/** String pronta para `document.cookie`. */
export function sidebarCookieValue(collapsed: boolean): string {
  const state: SidebarState = collapsed ? 'collapsed' : 'expanded';
  return `${SIDEBAR_COOKIE}=${state}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; samesite=lax`;
}
