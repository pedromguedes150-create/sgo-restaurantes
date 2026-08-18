import { Banknote, Boxes, Sparkles, BarChart3, GraduationCap, Users } from 'lucide-react';

export type IconType = React.ComponentType<{ className?: string }>;

export interface FamilyChild {
  href: string;
  /** Rótulo curto — vira segmento de aba, então tem de caber. */
  tab: string;
}
export interface Family {
  id: string;
  title: string;
  icon: IconType;
  /** O primeiro é onde a família abre. */
  children: FamilyChild[];
}

/**
 * FAMÍLIAS DE MÓDULOS — a arquitetura que enxugou o menu de 21 para 11.
 *
 * O menu (sidebar no desktop, hub no celular) lista a FAMÍLIA; dentro, os
 * módulos irmãos aparecem como abas. Vinte e uma entradas eram lista de
 * inventário, não menu: no celular davam 1.586px de rolagem e ninguém achava
 * nada sem varrer tudo.
 *
 * As rotas NÃO se movem, e isso é deliberado. Os links de notificação ficam
 * GRAVADOS em `Notification.link` apontando para `/modulos/*`: mover caminho
 * quebraria todo aviso antigo — a pessoa toca na notificação e cai em 404.
 * Cada módulo segue no endereço dele e ganha a barra de abas da família no
 * topo, o que dá o mesmo resultado na tela sem essa classe de estrago.
 *
 * Só entram aqui módulos que são IRMÃOS de verdade. Desperdícios, Ocorrências,
 * Pagamentos, Minha área e Comunicação ficam sozinhos: são diários e pesados,
 * e enfiá-los numa família só para reduzir a contagem esconderia o que mais se
 * usa.
 */
export const FAMILIES: Family[] = [
  {
    id: 'caixa',
    title: 'Caixa',
    icon: Banknote,
    children: [
      { href: '/modulos/comandas', tab: 'Comandas' },
      { href: '/modulos/cancelamentos', tab: 'Cancelamentos' },
      { href: '/modulos/troco', tab: 'Troco' },
    ],
  },
  {
    id: 'suprimentos',
    title: 'Suprimentos',
    icon: Boxes,
    children: [
      { href: '/modulos/notas', tab: 'Notas' },
      { href: '/modulos/inventario', tab: 'Inventário' },
      { href: '/modulos/produtos', tab: 'Pedidos' },
    ],
  },
  {
    id: 'rotinas',
    title: 'Rotinas da unidade',
    icon: Sparkles,
    children: [
      { href: '/modulos/oleo', tab: 'Coleta de óleo' },
      { href: '/modulos/higiene', tab: 'Higiene' },
    ],
  },
  {
    id: 'performance',
    title: 'Performance',
    icon: BarChart3,
    children: [
      { href: '/modulos/metas', tab: 'Metas' },
      { href: '/modulos/supervisao', tab: 'Supervisão' },
      { href: '/modulos/executivo', tab: 'Executivo' },
    ],
  },
  {
    id: 'treinamentos',
    title: 'Treinamentos',
    icon: GraduationCap,
    children: [
      { href: '/modulos/treinamentos', tab: 'Treinamentos' },
      { href: '/modulos/pops', tab: 'POPs' },
    ],
  },
  {
    id: 'pessoas',
    title: 'Pessoas',
    icon: Users,
    children: [
      { href: '/modulos/pessoas', tab: 'Colaboradores' },
      { href: '/modulos/folgas-equipe', tab: 'Controle de gerentes' },
    ],
  },
];

/** A família de um módulo, se ele pertencer a alguma. */
export function familyOf(href: string): Family | undefined {
  return FAMILIES.find((f) => f.children.some((c) => c.href === href));
}

/** Todos os hrefs que vivem dentro de alguma família. */
export const FAMILY_CHILD_HREFS = new Set(FAMILIES.flatMap((f) => f.children.map((c) => c.href)));
