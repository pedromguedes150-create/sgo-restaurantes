import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { viewableNavHrefs } from '@/lib/permissions';
import {
  Trash2, ClipboardList, Ticket, Boxes, AlertOctagon, Wallet, Receipt, Target, Users, BookOpen,
  Megaphone, Flame, Droplets, Banknote, NotebookPen, CalendarOff, GraduationCap, Eye, BarChart3, LifeBuoy,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

/**
 * Hub de módulos do MOBILE (a sidebar é só desktop). Espelha a sidebar:
 * mesmos módulos, mesmos grupos e MESMO filtro de permissões (matriz de
 * Perfis) — correção 16/07: faltavam Minha área, Folgas, Supervisão,
 * Executivo, Treinamentos e Ajuda, e não havia filtro por perfil.
 */
const GROUPS: { title: string; items: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] }[] = [
  {
    title: 'Principal',
    items: [
      { href: '/minha-area', label: 'Minha área', icon: NotebookPen },
      { href: '/modulos/comunicacao', label: 'Comunicação', icon: Megaphone },
      { href: '/ajuda', label: 'Treinamento da Plataforma', icon: LifeBuoy },
    ],
  },
  {
    title: 'Operação',
    items: [
      { href: '/modulos/desperdicios', label: 'Desperdícios', icon: Trash2 },
      { href: '/modulos/ocorrencias', label: 'Ocorrências', icon: AlertOctagon },
      { href: '/modulos/comandas', label: 'Comandas', icon: ClipboardList },
      { href: '/modulos/troco', label: 'Gestão de Troco', icon: Banknote },
      { href: '/modulos/cancelamentos', label: 'Cancelamentos', icon: Ticket },
      { href: '/modulos/inventario', label: 'Inventário', icon: Boxes },
      { href: '/modulos/notas', label: 'Notas Recebidas', icon: Receipt },
      { href: '/modulos/gas', label: 'Recebimento de Gás', icon: Flame },
      { href: '/modulos/oleo', label: 'Coleta de Óleo', icon: Droplets },
    ],
  },
  {
    title: 'Gestão',
    items: [
      { href: '/modulos/pagamentos', label: 'Pagamentos', icon: Wallet },
      { href: '/modulos/pessoas', label: 'Pessoas', icon: Users },
      { href: '/modulos/folgas-equipe', label: 'Folgas da equipe', icon: CalendarOff },
      { href: '/modulos/pops', label: 'POPs', icon: BookOpen },
      { href: '/modulos/treinamentos', label: 'Treinamentos', icon: GraduationCap },
      { href: '/modulos/metas', label: 'Metas', icon: Target },
      { href: '/modulos/supervisao', label: 'Rotina do Supervisor', icon: Eye },
      { href: '/modulos/executivo', label: 'Visão Executiva', icon: BarChart3 },
    ],
  },
];

export default async function ModulosPage() {
  const user = (await getSessionUser())!;
  const viewable = new Set(await viewableNavHrefs(user.role));
  // hrefs fora da matriz (sempre visíveis): minha-area/ajuda já estão na matriz via MODULES

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-brand">Módulos</h1>
      {GROUPS.map((g) => {
        const items = g.items.filter((it) => viewable.has(it.href));
        if (items.length === 0) return null;
        return (
          <div key={g.title} className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{g.title}</h2>
            <div className="grid grid-cols-2 gap-3">
              {items.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href}>
                  <Card className="h-full transition-colors hover:border-accent">
                    <CardContent className="flex h-full flex-col items-center justify-center gap-2 py-5 text-center">
                      <Icon className="h-7 w-7 text-brand" />
                      <span className="text-sm font-semibold">{label}</span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
