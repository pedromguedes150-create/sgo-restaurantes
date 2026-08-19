'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Trash2, Boxes, AlertOctagon, Wallet, Users, Megaphone, Banknote, NotebookPen,
  GraduationCap, BarChart3, Sparkles, ChevronRight, SearchX,
} from 'lucide-react';
import { Group, GroupLabel } from '@/components/ui/ds/group';
import { SearchField } from '@/components/ui/ds/field';
import { EmptyState } from '@/components/ui/ds/empty-state';

/**
 * Hub de módulos do MOBILE (a sidebar é só desktop).
 *
 * Era uma grade de 2 colunas com 21 cartões de ícone centralizado: 1.586px no
 * celular — duas telas de rolagem — e cartões com DUAS alturas (98px e 118px),
 * porque cinco rótulos quebravam em duas linhas. Com o texto sob o ícone, o olho
 * ziguezagueia entre as colunas em vez de descer uma lista.
 *
 * Agora são ONZE entradas em lista agrupada. As onze são FAMÍLIAS (ver
 * src/lib/nav-families.ts): "Caixa" abre em Comandas e leva a Cancelamentos e
 * Troco pelo botão ao lado do título. Desperdícios, Ocorrências, Pagamentos,
 * Minha área e Comunicação ficam sozinhos — são diários e pesados, e enfiá-los
 * numa família só para reduzir a contagem esconderia o que mais se usa.
 *
 * "Treinamento da Plataforma" saiu do hub: já é o 🎓 fixo no cabeçalho, em
 * qualquer aparelho.
 *
 * A BUSCA é o que de fato resolve "achar": com 21 itens, digitar três letras
 * ganha de qualquer rolagem. Ignora acento, porque ninguém digita "Solicitação"
 * com cedilha no celular.
 */
const GROUPS: { title: string; items: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] }[] = [
  {
    title: 'Operação',
    items: [
      { href: '/modulos/desperdicios', label: 'Desperdícios', icon: Trash2 },
      { href: '/modulos/ocorrencias', label: 'Ocorrências', icon: AlertOctagon },
      { href: '/modulos/comandas', label: 'Caixa', icon: Banknote },
      { href: '/modulos/notas', label: 'Suprimentos', icon: Boxes },
      { href: '/modulos/oleo', label: 'Rotinas da unidade', icon: Sparkles },
    ],
  },
  {
    title: 'Gestão',
    items: [
      { href: '/modulos/pagamentos', label: 'Pagamentos', icon: Wallet },
      { href: '/modulos/pessoas', label: 'Pessoas', icon: Users },
      { href: '/modulos/treinamentos', label: 'Treinamentos', icon: GraduationCap },
      { href: '/modulos/metas', label: 'Performance', icon: BarChart3 },
    ],
  },
  {
    title: 'Meu espaço',
    items: [
      { href: '/minha-area', label: 'Minha área', icon: NotebookPen },
      { href: '/modulos/comunicacao', label: 'Comunicação', icon: Megaphone },
    ],
  },
];

/** Sem acento e em minúscula — a busca tem de achar "oleo" digitando sem o acento. */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function ModulesHub({ viewable }: { viewable: string[] }) {
  const [q, setQ] = useState('');
  const permitidos = useMemo(() => new Set(viewable), [viewable]);

  const grupos = useMemo(() => {
    const t = norm(q.trim());
    return GROUPS
      .map((g) => ({
        title: g.title,
        items: g.items.filter((it) => permitidos.has(it.href) && (!t || norm(it.label).includes(t))),
      }))
      .filter((g) => g.items.length > 0);
  }, [q, permitidos]);

  const total = grupos.reduce((s, g) => s + g.items.length, 0);

  return (
    <div className="space-y-4">
      <SearchField
        aria-label="Buscar módulo"
        value={q}
        onValueChange={setQ}
        placeholder="Buscar módulo…"
      />

      {total === 0 ? (
        <EmptyState
          icon={SearchX}
          size="sm"
          title="Nenhum módulo com esse nome"
          description="Confira a escrita ou limpe a busca para ver todos."
        />
      ) : (
        grupos.map((g) => (
          <div key={g.title} className="space-y-1.5">
            <GroupLabel>{g.title}</GroupLabel>
            <Group>
              {g.items.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="sgo-control flex items-center gap-3 px-3 py-2.5"
                >
                  <Icon className="h-5 w-5 shrink-0 text-brand" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">{label}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                </Link>
              ))}
            </Group>
          </div>
        ))
      )}
    </div>
  );
}
