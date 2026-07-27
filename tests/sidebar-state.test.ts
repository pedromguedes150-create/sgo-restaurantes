import { describe, it, expect } from 'vitest';
import { isSidebarCollapsed, sidebarCookieValue, SIDEBAR_COOKIE } from '@/lib/sidebar-state';

describe('estado da sidebar (cookie)', () => {
  it('recolhe apenas com o valor exato "collapsed"', () => {
    expect(isSidebarCollapsed('collapsed')).toBe(true);
    expect(isSidebarCollapsed('expanded')).toBe(false);
  });

  it('cai para expandida quando o cookie está ausente ou é inválido', () => {
    expect(isSidebarCollapsed(undefined)).toBe(false);
    expect(isSidebarCollapsed(null)).toBe(false);
    expect(isSidebarCollapsed('')).toBe(false);
    expect(isSidebarCollapsed('COLLAPSED')).toBe(false);
    expect(isSidebarCollapsed('true')).toBe(false);
  });

  it('monta o cookie com path, validade e samesite', () => {
    const collapsed = sidebarCookieValue(true);
    expect(collapsed).toContain(`${SIDEBAR_COOKIE}=collapsed`);
    expect(collapsed).toContain('path=/');
    expect(collapsed).toContain('samesite=lax');
    expect(sidebarCookieValue(false)).toContain(`${SIDEBAR_COOKIE}=expanded`);
  });
});
