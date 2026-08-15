'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebarState } from '@/components/layout/sidebar-state-provider';
import { NAV_GROUPS, type NavGroup } from '@/components/layout/nav-data';
import { APP_VERSION_LABEL } from '@/lib/version';

export function Sidebar({ isAdmin, viewable, badges }: { isAdmin: boolean; viewable?: string[]; badges?: Record<string, number> }) {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebarState();
  const canSee = (href: string) => !viewable || viewable.includes(href);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  const groups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((it) => (!it.adminOnly || isAdmin) && canSee(it.href)) }))
    .filter((g) => g.items.length > 0);

  const activeGroupId = groups.find((g) => g.items.some((it) => isActive(it.href)))?.id;
  // Aberto = escolha explícita do usuário; sem escolha, o grupo ativo abre sozinho.
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (id: string) => open[id] ?? id === activeGroupId;
  const setGroup = (id: string, v: boolean) => setOpen((o) => ({ ...o, [id]: v }));
  const groupBadge = (g: NavGroup) => g.items.reduce((n, it) => n + (badges?.[it.href] ?? 0), 0);

  return (
    <aside
      className={cn(
        'sticky top-14 hidden h-[calc(100dvh-3.5rem)] shrink-0 overflow-y-auto border-r border-line bg-sgo-surface py-3 transition-[width] duration-sgo-2 ease-sgo-std motion-reduce:transition-none md:block print:hidden',
        collapsed ? 'w-[72px] px-2' : 'w-64 px-3',
      )}
    >
      <nav id="sidebar-nav" className="space-y-1">
        {groups.map((g) => {
          const GIcon = g.icon;
          const gActive = g.id === activeGroupId;
          const gb = groupBadge(g);

          // Modo recolhido (72px): só ícones dos grupos; clicar expande e abre o grupo.
          if (collapsed) {
            return (
              <button
                key={g.id}
                type="button"
                title={g.title}
                aria-label={g.title}
                onClick={() => { toggle(); setGroup(g.id, true); }}
                className={cn(
                  'relative flex h-11 w-full items-center justify-center rounded-control outline-none transition-colors duration-sgo-1 ease-sgo-std focus-visible:shadow-sgo-focus',
                  gActive ? 'bg-sgo-brand text-on-brand' : 'text-ink-500 hover:bg-sunken hover:text-ink-900',
                )}
              >
                <GIcon className="h-5 w-5" />
                {gb > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-pill bg-danger" />}
              </button>
            );
          }

          // Grupo de item único → o próprio cabeçalho é o link (sem acordeão).
          if (g.items.length === 1) {
            const only = g.items[0];
            const active = isActive(only.href);
            return (
              <Link
                key={g.id}
                href={only.href}
                className={cn(
                  'flex h-10 items-center gap-2.5 rounded-control px-2.5 text-[14px] font-medium outline-none transition-colors duration-sgo-1 ease-sgo-std focus-visible:shadow-sgo-focus',
                  active ? 'bg-sgo-brand text-on-brand' : 'text-ink-700 hover:bg-sunken hover:text-ink-900',
                )}
              >
                <GIcon className={cn('h-5 w-5 shrink-0', active ? 'text-on-brand' : 'text-ink-400')} />
                <span className="flex-1">{g.title}</span>
              </Link>
            );
          }

          const gOpen = isOpen(g.id);
          return (
            <div key={g.id}>
              <button
                type="button"
                onClick={() => setGroup(g.id, !gOpen)}
                aria-expanded={gOpen}
                className={cn(
                  'flex h-10 w-full items-center gap-2.5 rounded-control px-2.5 text-[13px] font-semibold outline-none transition-colors duration-sgo-1 ease-sgo-std focus-visible:shadow-sgo-focus',
                  gActive ? 'text-sgo-brand' : 'text-ink-700 hover:bg-sunken',
                )}
              >
                <GIcon className={cn('h-5 w-5 shrink-0', gActive ? 'text-sgo-brand' : 'text-ink-400')} />
                <span className="flex-1 text-left">{g.title}</span>
                {gb > 0 && !gOpen && (
                  <span className="rounded-pill bg-danger px-1.5 text-[11px] font-bold tabular-nums text-white">{gb}</span>
                )}
                <ChevronRight className={cn('h-4 w-4 shrink-0 text-ink-400 transition-transform duration-sgo-2 ease-sgo-std motion-reduce:transition-none', gOpen && 'rotate-90')} />
              </button>

              {gOpen && (
                <ul className="mt-0.5 space-y-0.5 pb-1">
                  {g.items.map(({ href, label, icon: Icon }) => {
                    const active = isActive(href);
                    const b = badges?.[href];
                    return (
                      <li key={href}>
                        <Link
                          href={href}
                          className={cn(
                            'flex h-10 items-center gap-2.5 rounded-control py-2 pl-9 pr-2.5 text-[14px] font-medium outline-none transition-colors duration-sgo-1 ease-sgo-std focus-visible:shadow-sgo-focus',
                            active ? 'bg-sgo-brand text-on-brand' : 'text-ink-700 hover:bg-sunken hover:text-ink-900',
                          )}
                        >
                          <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-on-brand' : 'text-ink-400')} />
                          <span className="flex-1">{label}</span>
                          {b ? (
                            <span className="rounded-pill bg-danger px-1.5 text-[11px] font-bold tabular-nums text-white">{b}</span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
      {!collapsed && <p className="mt-4 px-2.5 text-[11px] font-medium text-ink-500">SGO {APP_VERSION_LABEL}</p>}
    </aside>
  );
}
