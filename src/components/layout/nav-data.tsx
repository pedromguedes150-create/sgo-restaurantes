import { Inbox, GraduationCap, Bell, UserCircle } from 'lucide-react';
import type { AreaMontada } from '@/lib/nav/areas';

export type IconType = React.ComponentType<{ className?: string }>;
export interface NavLeaf { href: string; label: string; icon: IconType }

/**
 * Destinos que vivem no CABEÇALHO (fora do menu por áreas) — para a busca e a
 * migalha. São os ícones fixos da direita: inbox, ajuda, sino e perfil.
 */
export const HEADER_DESTINATIONS: NavLeaf[] = [
  { href: '/modulos/comunicacao', label: 'Comunicação', icon: Inbox },
  { href: '/notificacoes', label: 'Notificações', icon: Bell },
  { href: '/ajuda', label: 'Treinamento da Plataforma', icon: GraduationCap },
  { href: '/perfil', label: 'Meu Perfil', icon: UserCircle },
];

/**
 * Migalha (área › página) para o header.
 *
 * Lê O MENU MONTADO, não uma lista própria. Antes havia um `NAV_GROUPS` aqui
 * com os nomes dos grupos antigos: o menu passou a dizer "Operação › Rotinas
 * da unidade" e a migalha continuaria dizendo o nome de um grupo que não existe
 * mais na tela — dois vocabulários para o mesmo lugar.
 *
 * Casa pelo caminho MAIS LONGO: `/tarefas/historico` tem de virar "Histórico de
 * tarefas", não "Tarefas", que também casa por prefixo.
 */
export function crumbFor(pathname: string, areas: AreaMontada[]): { group?: string; label: string } | null {
  let melhor: { group: string; label: string; tamanho: number } | null = null;
  for (const a of areas) {
    for (const c of a.colunas) {
      for (const i of c.itens) {
        if (pathname !== i.href && !pathname.startsWith(i.href + '/')) continue;
        if (!melhor || i.href.length > melhor.tamanho) melhor = { group: a.titulo, label: i.label, tamanho: i.href.length };
      }
    }
  }
  if (melhor) return { group: melhor.group, label: melhor.label };

  for (const d of HEADER_DESTINATIONS) {
    if (pathname === d.href || pathname.startsWith(d.href + '/')) return { label: d.label };
  }
  return null;
}
