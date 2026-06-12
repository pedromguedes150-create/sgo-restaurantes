'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, ListChecks, Trash2, AlertOctagon, ClipboardList, Ticket,
  Boxes, Receipt, Wallet, Users, BookOpen, Target, ScrollText, Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Item { href: string; label: string; icon: React.ComponentType<{ className?: string }>; adminOnly?: boolean }

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Principal',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/tarefas', label: 'Tarefas', icon: ListChecks },
    ],
  },
  {
    title: 'Operação',
    items: [
      { href: '/modulos/desperdicios', label: 'Desperdícios', icon: Trash2 },
      { href: '/modulos/ocorrencias', label: 'Ocorrências', icon: AlertOctagon },
      { href: '/modulos/comandas', label: 'Comandas', icon: ClipboardList },
      { href: '/modulos/cancelamentos', label: 'Cancelamentos', icon: Ticket },
      { href: '/modulos/inventario', label: 'Inventário', icon: Boxes },
      { href: '/modulos/notas', label: 'Notas Recebidas', icon: Receipt },
    ],
  },
  {
    title: 'Gestão',
    items: [
      { href: '/modulos/pagamentos', label: 'Pagamentos', icon: Wallet },
      { href: '/modulos/pessoas', label: 'Pessoas', icon: Users },
      { href: '/modulos/pops', label: 'POPs', icon: BookOpen },
      { href: '/modulos/metas', label: 'Metas', icon: Target },
    ],
  },
  {
    title: 'Administração',
    items: [
      { href: '/auditoria', label: 'Auditoria', icon: ScrollText, adminOnly: true },
      { href: '/configuracoes', label: 'Configurações', icon: Settings },
    ],
  },
];

export function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-60 shrink-0 overflow-y-auto border-r bg-background px-3 py-4 md:block">
      <nav className="space-y-5">
        {GROUPS.map((g) => {
          const items = g.items.filter((it) => !it.adminOnly || isAdmin);
          if (items.length === 0) return null;
          return (
            <div key={g.title}>
              <p className="mb-1.5 px-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{g.title}</p>
              <ul className="space-y-0.5">
                {items.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href || pathname.startsWith(href + '/');
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        className={cn(
                          'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                          active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-secondary',
                        )}
                      >
                        <Icon className={cn('h-5 w-5', active ? 'text-white/85' : 'text-muted-foreground')} />
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
