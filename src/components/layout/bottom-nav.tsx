'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ListChecks, LayoutGrid, Users, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OPEN_COMMAND_EVENT } from '@/components/layout/command-palette';

// Navegação principal no celular (5 itens). "Módulos" abre o menu completo
// (espelha os 6 grupos); "Buscar" abre o ⌘K (não há atalho de teclado no celular).
const items = [
  { href: '/dashboard', label: 'Início', icon: Home },
  { href: '/tarefas', label: 'Tarefas', icon: ListChecks },
  { href: '/modulos', label: 'Módulos', icon: LayoutGrid },
  { href: '/modulos/pessoas', label: 'Pessoas', icon: Users },
];

export function BottomNav() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-glass pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 md:hidden print:hidden">
      <ul className="mx-auto flex max-w-md items-stretch">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium outline-none transition-colors duration-sgo-1 ease-sgo-std focus-visible:shadow-sgo-focus',
                  active ? 'text-sgo-brand' : 'text-ink-500',
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_EVENT))}
            aria-label="Buscar"
            className="flex h-14 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-ink-500 outline-none transition-colors duration-sgo-1 ease-sgo-std hover:text-ink-700 focus-visible:shadow-sgo-focus"
          >
            <Search className="h-5 w-5" />
            Buscar
          </button>
        </li>
      </ul>
    </nav>
  );
}
