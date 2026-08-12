import {
  Home, LayoutGrid, Users, BarChart3, Settings,
  LayoutDashboard, NotebookPen, Megaphone, ListChecks, BookOpen, GraduationCap,
  ClipboardList, Trash2, AlertOctagon, Banknote, Ticket, Receipt, Boxes, Droplets, Sparkles, PackagePlus,
  Wallet, CalendarOff, Target, Eye, ScrollText, Bell, UserCircle,
} from 'lucide-react';

export type IconType = React.ComponentType<{ className?: string }>;
export interface NavLeaf { href: string; label: string; icon: IconType; adminOnly?: boolean }
export interface NavGroup { id: string; title: string; icon: IconType; items: NavLeaf[] }

// Onda 1 — arquitetura de informação em 6 grupos (mapa aprovado 2026-08-12).
// Fonte única consumida pela sidebar, pelo breadcrumb do header e pelo ⌘K.
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'inicio', title: 'Início', icon: Home,
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/minha-area', label: 'Minha área', icon: NotebookPen },
      // Temporário: Comunicação vai para o inbox do header no commit 8 desta onda.
      { href: '/modulos/comunicacao', label: 'Comunicação', icon: Megaphone },
    ],
  },
  {
    id: 'tarefas', title: 'Tarefas', icon: ListChecks,
    items: [
      { href: '/tarefas', label: 'Tarefas', icon: ListChecks },
      { href: '/modulos/pops', label: 'POPs', icon: BookOpen },
      { href: '/modulos/treinamentos', label: 'Treinamentos', icon: GraduationCap },
    ],
  },
  {
    id: 'operacao', title: 'Operação', icon: LayoutGrid,
    items: [
      { href: '/modulos/comandas', label: 'Comandas', icon: ClipboardList },
      { href: '/modulos/desperdicios', label: 'Desperdícios', icon: Trash2 },
      { href: '/modulos/ocorrencias', label: 'Ocorrências', icon: AlertOctagon },
      { href: '/modulos/troco', label: 'Gestão de Troco', icon: Banknote },
      { href: '/modulos/cancelamentos', label: 'Cancelamentos', icon: Ticket },
      { href: '/modulos/notas', label: 'Notas Recebidas', icon: Receipt },
      { href: '/modulos/inventario', label: 'Inventário', icon: Boxes },
      { href: '/modulos/oleo', label: 'Coleta de Óleo', icon: Droplets },
      { href: '/modulos/higiene', label: 'Higiene', icon: Sparkles },
      { href: '/modulos/produtos', label: 'Solicitação de Produtos', icon: PackagePlus },
    ],
  },
  {
    id: 'pessoas', title: 'Pessoas', icon: Users,
    items: [
      { href: '/modulos/pessoas', label: 'Pessoas', icon: Users },
      { href: '/modulos/pagamentos', label: 'Pagamentos', icon: Wallet },
      { href: '/modulos/folgas-equipe', label: 'Controle de gerentes', icon: CalendarOff },
    ],
  },
  {
    id: 'performance', title: 'Performance', icon: BarChart3,
    items: [
      { href: '/modulos/metas', label: 'Metas', icon: Target },
      { href: '/modulos/executivo', label: 'Visão Executiva', icon: BarChart3 },
      { href: '/modulos/supervisao', label: 'Rotina do Supervisor', icon: Eye },
      { href: '/auditoria', label: 'Auditoria', icon: ScrollText, adminOnly: true },
    ],
  },
  {
    id: 'ajustes', title: 'Ajustes', icon: Settings,
    items: [{ href: '/configuracoes', label: 'Configurações', icon: Settings }],
  },
];

// Destinos que vivem no header (fora da sidebar) — para o ⌘K e o breadcrumb.
export const HEADER_DESTINATIONS: NavLeaf[] = [
  { href: '/notificacoes', label: 'Notificações', icon: Bell },
  { href: '/ajuda', label: 'Treinamento da Plataforma', icon: GraduationCap },
  { href: '/perfil', label: 'Meu Perfil', icon: UserCircle },
];

/** Migalha (grupo › item) para o header. Fallback nos destinos do header. */
export function crumbFor(pathname: string): { group?: string; label: string } | null {
  for (const g of NAV_GROUPS) {
    for (const it of g.items) {
      if (pathname === it.href || pathname.startsWith(it.href + '/')) {
        return { group: g.title, label: it.label };
      }
    }
  }
  for (const d of HEADER_DESTINATIONS) {
    if (pathname === d.href || pathname.startsWith(d.href + '/')) return { label: d.label };
  }
  return null;
}
