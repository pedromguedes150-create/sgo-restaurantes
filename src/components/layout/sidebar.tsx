'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, ListChecks, Trash2, AlertOctagon, ClipboardList, Ticket,
  Boxes, Receipt, Wallet, Users, BookOpen, Target, ScrollText, Settings, GraduationCap, LifeBuoy, Megaphone, Droplets, NotebookPen, CalendarOff, Banknote, Eye, BarChart3, Sparkles, PackagePlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
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

export function Sidebar({ isAdmin, viewable, badges }: { isAdmin: boolean; viewable?: string[]; badges?: Record<string, number> }) {
  const pathname = usePathname();
  const canSee = (href: string) => !viewable || viewable.includes(href);

  // w-60 até `lg`; de `lg` em diante w-52 devolve 32px de largura ao conteúdo
  // (a sidebar é `hidden` no celular, então nada muda no mobile).
  return (
    <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-60 shrink-0 overflow-y-auto border-r bg-background px-3 py-4 md:block lg:w-52 print:hidden">
      <nav className="space-y-5">
        {GROUPS.map((g) => {
          const items = g.items.filter((it) => (!it.adminOnly || isAdmin) && canSee(it.href));
          if (items.length === 0) return null;
          return (
            <div key={g.title}>
              <p className="mb-1.5 px-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{g.title}</p>
              <ul className="space-y-0.5">
                {items.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href || pathname.startsWith(href + '/');
                  const badge = badges?.[href];
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
                        <span className="flex-1">{label}</span>
                        {badge ? <span className="rounded-full bg-critical px-1.5 text-xs font-bold text-white">{badge}</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <p className="mt-6 px-2 text-[11px] font-medium text-muted-foreground">SGO {APP_VERSION_LABEL}</p>
    </aside>
  );
}
