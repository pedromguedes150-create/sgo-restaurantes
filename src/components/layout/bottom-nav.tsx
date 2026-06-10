'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ListChecks, Grid3x3, Users, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

// Navegação principal (spec): Dashboard · Tarefas · Módulos · Pessoas · Configurações
const items = [
  { href: '/dashboard', label: 'Início', icon: LayoutDashboard },
  { href: '/tarefas', label: 'Tarefas', icon: ListChecks },
  { href: '/modulos', label: 'Módulos', icon: Grid3x3 },
  { href: '/pessoas', label: 'Pessoas', icon: Users },
  { href: '/configuracoes', label: 'Config.', icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden">
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <Icon className={cn('h-6 w-6', active && 'text-accent')} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
