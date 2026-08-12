'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { LogOut, Bell, ArrowLeft, GraduationCap, PanelLeftClose, PanelLeftOpen, ChevronRight } from 'lucide-react';
import { useSidebarState } from '@/components/layout/sidebar-state-provider';
import { crumbFor } from '@/components/layout/nav-data';
import { UnitSwitcher, type UnitOption } from '@/components/layout/unit-switcher';

const iconBtn =
  'inline-flex h-11 w-11 items-center justify-center rounded-control text-ink-500 outline-none transition-colors duration-sgo-1 ease-sgo-std hover:bg-sunken hover:text-ink-900 focus-visible:shadow-sgo-focus md:h-9 md:w-9';

export function AppHeader({ userName, roleLabel, unread = 0, units = [], selectedUnitId = null }: { userName: string; roleLabel: string; unread?: number; units?: UnitOption[]; selectedUnitId?: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const showBack = pathname !== '/dashboard';
  const crumb = crumbFor(pathname);
  const { collapsed, toggle } = useSidebarState();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  const initials = userName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    // Barra branca translúcida (backdrop blur/saturate) — substitui o header bordô.
    // Alinha pelo mesmo envelope do conteúdo. Altura 48px no mobile, 56px a partir de md.
    <header className="sticky top-0 z-30 border-b border-line bg-glass backdrop-blur-xl backdrop-saturate-150 print:hidden">
      <div className="mx-auto flex h-12 w-full max-w-6xl items-center justify-between gap-2 px-4 md:h-14 lg:max-w-none lg:pl-3 lg:pr-6 2xl:max-w-[1760px]">
        <div className="flex min-w-0 items-center gap-1">
          {/* Recolher/expandir a sidebar (desktop). */}
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-controls="sidebar-nav"
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className={`${iconBtn} hidden lg:inline-flex`}
          >
            {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
          </button>

          {showBack && (
            <button type="button" onClick={() => router.back()} aria-label="Voltar" className={`${iconBtn} -ml-1`}>
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}

          {/* Breadcrumb: grupo › página. */}
          <div className="flex min-w-0 items-center gap-1.5 pl-1">
            {crumb?.group && (
              <>
                <span className="hidden text-[13px] font-medium text-ink-500 sm:inline">{crumb.group}</span>
                <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-ink-400 sm:inline" />
              </>
            )}
            <span className="truncate text-[15px] font-semibold text-ink-900">{crumb?.label ?? 'SGO'}</span>
          </div>

          {units.length > 0 && (
            <div className="ml-1 shrink-0 border-l border-line pl-2">
              <UnitSwitcher units={units} selectedId={selectedUnitId} />
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Link href="/ajuda" aria-label="Treinamento da Plataforma" className={iconBtn}>
            <GraduationCap className="h-5 w-5" />
          </Link>
          <Link href="/notificacoes" aria-label="Notificações" className={`${iconBtn} relative`}>
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute right-1.5 top-1.5 inline-flex min-w-[18px] items-center justify-center rounded-pill bg-danger px-1 text-[10px] font-bold leading-4 tabular-nums text-white">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </Link>
          {/* Avatar + nome levam ao Meu Perfil. */}
          <Link href="/perfil" className="ml-1 flex items-center gap-2 rounded-control py-1 pl-1 pr-2 outline-none hover:bg-sunken focus-visible:shadow-sgo-focus" aria-label="Meu Perfil">
            <span className="flex h-9 w-9 items-center justify-center rounded-control bg-sgo-brand text-[13px] font-bold text-on-brand">{initials}</span>
            <span className="hidden leading-tight lg:block">
              <span className="block text-[13px] font-semibold text-ink-900">{userName}</span>
              <span className="block text-[11px] text-ink-500">{roleLabel}</span>
            </span>
          </Link>
          <button type="button" onClick={logout} aria-label="Sair" className={iconBtn}>
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
