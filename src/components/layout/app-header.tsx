'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { LogOut, Bell, ArrowLeft, GraduationCap, ChevronRight, Search, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePageChrome } from '@/components/layout/page-chrome';
import { crumbFor } from '@/components/layout/nav-data';
import { UnitSwitcher, type UnitOption } from '@/components/layout/unit-switcher';
import { OPEN_COMMAND_EVENT } from '@/components/layout/command-palette';
import { GlobalSearch } from '@/components/layout/global-search';
import type { AreaMontada } from '@/lib/nav/areas';

const iconBtn =
  'inline-flex h-11 w-11 items-center justify-center rounded-control text-ink-500 outline-none transition-colors duration-sgo-1 ease-sgo-std hover:bg-sunken hover:text-ink-900 focus-visible:shadow-sgo-focus md:h-9 md:w-9';

export function AppHeader({ userName, roleLabel, unread = 0, commPending = 0, units = [], selectedUnitId = null, areas = [] }: { userName: string; roleLabel: string; unread?: number; commPending?: number; units?: UnitOption[]; selectedUnitId?: string | null; areas?: AreaMontada[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const showBack = pathname !== '/dashboard';
  const crumb = crumbFor(pathname, areas);
  const { scrolled, collapsed: titleCollapsed, title: pageTitle } = usePageChrome();
  // Título inline: telas com <LargeTitle> só o mostram ao rolar; telas legadas
  // (sem título grande) mostram o rótulo do breadcrumb sempre.
  const label = pageTitle ?? crumb?.label ?? null;
  const showLabel = pageTitle != null ? titleCollapsed : label != null;

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  const initials = userName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    // Barra branca translúcida (backdrop blur/saturate) — substitui o header bordô.
    // Alinha pelo mesmo envelope do conteúdo. Altura 48px no mobile, 56px a partir de md.
    <header className={cn('sticky top-0 z-30 border-b bg-glass backdrop-blur-xl backdrop-saturate-150 transition-colors duration-sgo-2 ease-sgo-std print:hidden', scrolled ? 'border-line' : 'border-transparent')}>
      <div className="mx-auto flex h-12 w-full max-w-6xl items-center justify-between gap-2 px-4 md:h-14 lg:max-w-none lg:pl-3 lg:pr-6 2xl:max-w-[1760px]">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {showBack && (
            <button type="button" onClick={() => router.back()} aria-label="Voltar" className={`${iconBtn} -ml-1`}>
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}

          {/* Breadcrumb: grupo › página. O rótulo colapsa/expande conforme o scroll. */}
          <div className="flex min-w-0 items-center gap-1.5 pl-1">
            {crumb?.group && <span className="hidden text-xs font-medium text-ink-500 sm:inline">{crumb.group}</span>}
            {crumb?.group && showLabel && label && <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-ink-400 sm:inline" />}
            {showLabel && label ? (
              <span className="truncate text-sm font-semibold text-ink-900">{label}</span>
            ) : !crumb?.group ? (
              <span className="text-sm font-semibold text-ink-900">SGO</span>
            ) : null}
          </div>

          {units.length > 0 && (
            /* `min-w-0` e NÃO `shrink-0`: com "Toda a Rede" o seletor ficou
               mais largo e, a 375px, passava POR CIMA dos ícones da direita —
               o grupo da esquerda não encolhia. Agora ele cede espaço e o nome
               trunca. */
            <div className="ml-1 min-w-0 border-l border-line pl-2">
              <UnitSwitcher units={units} selectedId={selectedUnitId} />
            </div>
          )}
        </div>

        {/* A BUSCA fica no meio do cabeçalho, sempre aberta, a partir de `lg`.
            Era um botão: botão exige saber que a busca existe; um campo com o
            cursor piscando convida a digitar — e é por ele que se chega ao que
            não está no menu visível. */}
        <GlobalSearch areas={areas} className="mx-3 hidden w-full max-w-sm lg:block" />

        <div className="flex shrink-0 items-center gap-0.5">
          {/* No celular a busca continua sendo o ⌘K em tela cheia: um campo de
              320px no cabeçalho de um telefone não sobra espaço para nada. */}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_EVENT))}
            aria-label="Buscar"
            className={`${iconBtn} lg:hidden`}
          >
            <Search className="h-5 w-5" />
          </button>
          <Link href="/modulos/comunicacao" aria-label="Comunicação" className={`${iconBtn} relative`}>
            <Inbox className="h-5 w-5" />
            {commPending > 0 && (
              <span className="absolute right-1.5 top-1.5 inline-flex min-w-5 items-center justify-center rounded-pill bg-danger px-1 text-[10px] font-bold leading-4 tabular-nums text-on-brand">
                {commPending > 99 ? '99+' : commPending}
              </span>
            )}
          </Link>
          <Link href="/ajuda" aria-label="Treinamento da Plataforma" className={iconBtn}>
            <GraduationCap className="h-5 w-5" />
          </Link>
          <Link href="/notificacoes" aria-label="Notificações" className={`${iconBtn} relative`}>
            <Bell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute right-1.5 top-1.5 inline-flex min-w-5 items-center justify-center rounded-pill bg-danger px-1 text-[10px] font-bold leading-4 tabular-nums text-on-brand">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </Link>
          {/* Avatar + nome levam ao Meu Perfil. */}
          <Link href="/perfil" className="ml-1 flex items-center gap-2 rounded-control py-1 pl-1 pr-2 outline-none hover:bg-sunken focus-visible:shadow-sgo-focus" aria-label="Meu Perfil">
            <span className="flex h-9 w-9 items-center justify-center rounded-control bg-brand text-xs font-bold text-on-brand">{initials}</span>
            <span className="hidden leading-tight lg:block">
              <span className="block text-xs font-semibold text-ink-900">{userName}</span>
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
