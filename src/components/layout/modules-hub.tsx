'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, SearchX, Star } from 'lucide-react';
import { Group, GroupLabel } from '@/components/ui/ds/group';
import { SearchField } from '@/components/ui/ds/field';
import { EmptyState } from '@/components/ui/ds/empty-state';
import { FavoriteStar, useFavoritos } from '@/components/layout/favoritos';
import type { AreaMontada, ItemDoMenu } from '@/lib/nav/areas';

/**
 * Hub de módulos do CELULAR — a lista completa do que a pessoa pode abrir.
 *
 * Passou a ler O MESMO catálogo do menu do desktop (`src/lib/nav/areas.ts`).
 * Antes tinha a própria lista de doze itens escrita à mão: Troco, Inventário,
 * Higiene, Atestados, Desligamentos, os relatórios e as dezoito telas de
 * Configurações simplesmente NÃO EXISTIAM para quem usa o celular — não
 * estavam no hub nem na barra de baixo, e só se chegava a elas por link de
 * notificação. Agora o que a permissão libera, o hub mostra.
 *
 * Os FAVORITOS vêm primeiro. É o que resolve o problema de verdade de quem
 * trabalha no salão: cada gerente usa cinco telas o dia inteiro, e o sistema
 * ganha módulo novo todo mês.
 */
export function ModulesHub({ areas }: { areas: AreaMontada[] }) {
  const [q, setQ] = useState('');
  const { favoritos } = useFavoritos();

  const todos = useMemo<(ItemDoMenu & { area: string })[]>(
    () => areas.flatMap((a) => a.colunas.flatMap((c) => c.itens.map((i) => ({ ...i, area: a.titulo })))),
    [areas],
  );

  /* Favorito de tela que a pessoa deixou de poder abrir some da lista, mas não
     é apagado: devolver a permissão traz o atalho de volta sem ela precisar
     favoritar outra vez. */
  const marcados = useMemo(() => {
    const porHref = new Map(todos.map((i) => [i.href, i]));
    return favoritos.map((h) => porHref.get(h)).filter((i): i is ItemDoMenu & { area: string } => Boolean(i));
  }, [favoritos, todos]);

  const t = norm(q.trim());
  const grupos = useMemo(() => {
    if (!t) return areas.map((a) => ({ titulo: a.titulo, itens: a.colunas.flatMap((c) => c.itens) })).filter((g) => g.itens.length > 0);
    /* Buscando, a divisão por área só atrapalha: o que importa é a lista curta
       do que casou. */
    return [{ titulo: 'Resultados', itens: todos.filter((i) => norm(i.label).includes(t) || norm(i.area).includes(t)) }]
      .filter((g) => g.itens.length > 0);
  }, [areas, todos, t]);

  const total = grupos.reduce((s, g) => s + g.itens.length, 0);

  return (
    <div className="space-y-4">
      <SearchField aria-label="Buscar módulo" value={q} onValueChange={setQ} placeholder="Buscar módulo…" />

      {!t && marcados.length > 0 && (
        <div className="space-y-1.5">
          <GroupLabel>Favoritos</GroupLabel>
          <Group>
            {marcados.map((i) => <Linha key={i.href} item={i} />)}
          </Group>
        </div>
      )}

      {total === 0 ? (
        <EmptyState
          icon={SearchX}
          size="sm"
          title="Nenhum módulo com esse nome"
          description="Confira a escrita ou limpe a busca para ver todos."
        />
      ) : (
        grupos.map((g) => (
          <div key={g.titulo} className="space-y-1.5">
            <GroupLabel>{g.titulo}</GroupLabel>
            <Group>
              {g.itens.map((i) => <Linha key={i.href} item={i} />)}
            </Group>
          </div>
        ))
      )}

      {marcados.length === 0 && (
        <p className="flex items-center gap-1.5 px-1 text-xs text-ink-500">
          <Star className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden />
          Toque na estrela para fixar o que você mais usa no topo desta lista e nos atalhos do início.
        </p>
      )}
    </div>
  );
}

function Linha({ item }: { item: ItemDoMenu }) {
  return (
    <div className="flex items-center">
      <Link href={item.href} className="sgo-control flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900">{item.label}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
      </Link>
      {/* No celular a estrela fica SEMPRE visível: não há hover onde revelá-la. */}
      <FavoriteStar href={item.href} label={item.label} className="mr-2" />
    </div>
  );
}

/** Sem acento e em minúscula — a busca tem de achar "oleo" digitado sem acento. */
function norm(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
