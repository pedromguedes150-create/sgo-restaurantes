import {
  Home, LayoutGrid, Users, BarChart3, Settings,
  LayoutDashboard, NotebookPen, Inbox, ListChecks, GraduationCap,
  Trash2, AlertOctagon, Banknote, Boxes, Sparkles,
  Wallet, Target, ScrollText, Bell, UserCircle,
} from 'lucide-react';

export type IconType = React.ComponentType<{ className?: string }>;
export interface NavLeaf { href: string; label: string; icon: IconType; adminOnly?: boolean }
export interface NavGroup { id: string; title: string; icon: IconType; items: NavLeaf[] }

// Arquitetura de informação em 6 grupos. Fonte única consumida pela sidebar,
// pelo breadcrumb do header e pelo ⌘K.
//
// 18/08: as entradas caíram de 21 para 11. Cada entrada que virou FAMÍLIA
// (Caixa, Suprimentos, Rotinas, Treinamentos, Performance, Pessoas) aponta para
// o primeiro irmão e leva aos outros pelo botão ao lado do título — ver
// src/lib/nav-families.ts. As ROTAS não se moveram: os links de notificação
// ficam gravados no banco apontando para /modulos/*, e mover caminho quebraria
// todo aviso antigo.
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'inicio', title: 'Início', icon: Home,
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/minha-area', label: 'Minha área', icon: NotebookPen },
    ],
  },
  {
    id: 'tarefas', title: 'Tarefas', icon: ListChecks,
    items: [
      { href: '/tarefas', label: 'Tarefas', icon: ListChecks },
      { href: '/modulos/treinamentos', label: 'Treinamentos', icon: GraduationCap },
    ],
  },
  {
    id: 'operacao', title: 'Operação', icon: LayoutGrid,
    items: [
      { href: '/modulos/desperdicios', label: 'Desperdícios', icon: Trash2 },
      { href: '/modulos/ocorrencias', label: 'Ocorrências', icon: AlertOctagon },
      { href: '/modulos/comandas', label: 'Caixa', icon: Banknote },
      { href: '/modulos/notas', label: 'Suprimentos', icon: Boxes },
      { href: '/modulos/oleo', label: 'Rotinas da unidade', icon: Sparkles },
    ],
  },
  {
    id: 'pessoas', title: 'Pessoas', icon: Users,
    items: [
      { href: '/modulos/pessoas', label: 'Pessoas', icon: Users },
      { href: '/modulos/pagamentos', label: 'Pagamentos', icon: Wallet },
    ],
  },
  {
    id: 'performance', title: 'Performance', icon: BarChart3,
    items: [
      { href: '/modulos/metas', label: 'Metas e indicadores', icon: Target },
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
  { href: '/modulos/comunicacao', label: 'Comunicação', icon: Inbox },
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
