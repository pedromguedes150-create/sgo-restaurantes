'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard, ListChecks, Trash2, AlertOctagon, ClipboardList, Ticket,
  Boxes, Receipt, Wallet, Users, BookOpen, Target, ScrollText, Settings, GraduationCap, LifeBuoy, Megaphone, Droplets, NotebookPen, CalendarOff, Banknote, Eye, BarChart3, Sparkles, PackagePlus,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { sidebarCookieValue } from '@/lib/sidebar-state';
import { APP_VERSION_LABEL } from '@/lib/version';

interface Item { href: string; label: string; icon: React.ComponentType<{ className?: string }>; adminOnly?: boolean }

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Principal',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/minha-area', label: 'Minha área', icon: NotebookPen },
      { href: '/tarefas', label: 'Tarefas', icon: ListChecks },
      { href: '/modulos/comunicacao', label: 'Comunicação', icon: Megaphone },
      { href: '/ajuda', label: 'Treinamento da Plataforma', icon: LifeBuoy },
    ],
  },
  {
    title: 'Operação',
    items: [
      { href: '/modulos/desperdicios', label: 'Desperdícios', icon: Trash2 },
      { href: '/modulos/ocorrencias', label: 'Ocorrências', icon: AlertOctagon },
      // Manutenção saiu da sidebar (07/07): acesso via Ocorrências → sub-aba Manutenção
      { href: '/modulos/comandas', label: 'Comandas', icon: ClipboardList },
      { href: '/modulos/troco', label: 'Gestão de Troco', icon: Banknote },
      { href: '/modulos/cancelamentos', label: 'Cancelamentos', icon: Ticket },
      { href: '/modulos/inventario', label: 'Inventário', icon: Boxes },
      { href: '/modulos/notas', label: 'Notas Recebidas', icon: Receipt },
      // Recebimento de Gás foi absorvido por Notas Recebidas (23/07): lançamento pelo
      // fornecedor de gás na nota + aba "Análise de gás". A rota /modulos/gas redireciona.
      { href: '/modulos/oleo', label: 'Coleta de Óleo', icon: Droplets },
      { href: '/modulos/higiene', label: 'Higiene dos banheiros', icon: Sparkles },
      { href: '/modulos/produtos', label: 'Solicitação de Produtos', icon: PackagePlus },
    ],
  },
  {
    title: 'Gestão',
    items: [
      { href: '/modulos/pagamentos', label: 'Pagamentos', icon: Wallet },
      { href: '/modulos/pessoas', label: 'Pessoas', icon: Users },
      { href: '/modulos/folgas-equipe', label: 'Controle de gerentes', icon: CalendarOff },
      { href: '/modulos/pops', label: 'POPs', icon: BookOpen },
      { href: '/modulos/treinamentos', label: 'Treinamentos', icon: GraduationCap },
      { href: '/modulos/metas', label: 'Metas', icon: Target },
      { href: '/modulos/supervisao', label: 'Rotina do Supervisor', icon: Eye },
      { href: '/modulos/executivo', label: 'Visão Executiva', icon: BarChart3 },
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

export function Sidebar({
  isAdmin,
  viewable,
  badges,
  defaultCollapsed = false,
}: {
  isAdmin: boolean;
  viewable?: string[];
  badges?: Record<string, number>;
  /** Vem do cookie lido no servidor — evita piscar na hidratação. */
  defaultCollapsed?: boolean;
}) {
  const pathname = usePathname();
  const canSee = (href: string) => !viewable || viewable.includes(href);

  // O estado sobrevive à navegação sozinho: no App Router o layout não é
  // desmontado entre telas. O cookie cobre o reload.
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = sidebarCookieValue(next);
  };

  // Larguras: w-60 até `lg`; de `lg` em diante w-52 expandida ou w-14 (faixa só
  // de ícones) recolhida. Recolher é feature de desktop — a sidebar é `hidden`
  // no celular e o botão é `lg:flex`, então nada muda no mobile nem no tablet.
  return (
    <aside
      className={cn(
        'sticky top-16 hidden h-[calc(100dvh-4rem)] w-60 shrink-0 overflow-y-auto border-r bg-background py-4 transition-[width] duration-200 ease-out motion-reduce:transition-none md:block print:hidden',
        collapsed ? 'px-3 lg:w-14 lg:px-2' : 'px-3 lg:w-52',
      )}
    >
      {/* Sticky: a lista é longa e o botão não pode sumir no scroll da aside. */}
      <div
        className={cn(
          'sticky top-0 z-10 mb-2 hidden bg-background pb-1 lg:flex',
          collapsed ? 'justify-center' : 'justify-end',
        )}
      >
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="sidebar-nav"
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      </div>
      <nav id="sidebar-nav" className="space-y-5">
        {GROUPS.map((g) => {
          const items = g.items.filter((it) => (!it.adminOnly || isAdmin) && canSee(it.href));
          if (items.length === 0) return null;
          return (
            <div key={g.title}>
              {/* Recolhida, o `space-y-5` entre grupos já dá a separação. */}
              <p
                className={cn(
                  'mb-1.5 px-2 text-xs font-bold uppercase tracking-wide text-muted-foreground',
                  collapsed && 'lg:hidden',
                )}
              >
                {g.title}
              </p>
              <ul className="space-y-0.5">
                {items.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href || pathname.startsWith(href + '/');
                  const badge = badges?.[href];
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        // Recolhida o rótulo some, então o nome vira tooltip
                        // nativa (o projeto não tem componente de tooltip).
                        title={collapsed ? label : undefined}
                        className={cn(
                          'relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                          active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-secondary',
                          collapsed && 'lg:justify-center lg:gap-0 lg:px-0',
                        )}
                      >
                        <Icon className={cn('h-5 w-5 shrink-0', active ? 'text-white/85' : 'text-muted-foreground')} />
                        <span className={cn('flex-1', collapsed && 'lg:hidden')}>{label}</span>
                        {badge ? (
                          <span
                            className={cn(
                              'rounded-full bg-critical px-1.5 text-xs font-bold text-white',
                              // Sem rótulo não há onde a pílula ficar: vira
                              // marcador no canto do ícone.
                              collapsed && 'lg:absolute lg:right-0.5 lg:top-0.5 lg:px-1 lg:text-[10px] lg:leading-4',
                            )}
                          >
                            {badge}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <p className={cn('mt-6 px-2 text-[11px] font-medium text-muted-foreground', collapsed && 'lg:hidden')}>
        SGO {APP_VERSION_LABEL}
      </p>
    </aside>
  );
}
