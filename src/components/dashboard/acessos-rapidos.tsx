'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Star, LayoutGrid } from 'lucide-react';
import { useFavoritos } from '@/components/layout/favoritos';
import type { AreaMontada, ItemDoMenu } from '@/lib/nav/areas';

/**
 * ACESSOS RÁPIDOS do gerente — a grade de ferramentas do dia a dia.
 *
 * Mostra os FAVORITOS quando houver; sem favorito nenhum, cai numa sugestão
 * padrão das telas mais usadas na operação. O padrão importa: a grade vazia
 * com "favorite alguma coisa" empurra a configuração para quem só quer
 * trabalhar, e quem abre o SGO às seis da manhã não vai parar para curar um
 * menu.
 *
 * Tudo aqui sai do MENU JÁ FILTRADO pela permissão e pela unidade — inclusive
 * o recorte da pizzaria. Atalho que a pessoa não pode abrir não aparece.
 */

/** A ordem de preferência quando a pessoa ainda não escolheu nada. */
const SUGERIDOS = [
  '/tarefas',
  '/modulos/ocorrencias',
  '/modulos/desperdicios',
  '/modulos/comandas',
  '/modulos/produtos',
  '/modulos/oleo',
  '/modulos/pizzas',
  '/modulos/pagamentos',
];

export function AcessosRapidos({ areas }: { areas: AreaMontada[] }) {
  const { favoritos } = useFavoritos();

  const porHref = useMemo(
    () => new Map(areas.flatMap((a) => a.colunas.flatMap((c) => c.itens)).map((i) => [i.href, i])),
    [areas],
  );

  const itens = useMemo<ItemDoMenu[]>(() => {
    /* Favorito de tela que a pessoa deixou de poder abrir some daqui sem ser
       apagado: devolver a permissão traz o atalho de volta. */
    const escolhidos = favoritos.map((h) => porHref.get(h)).filter((i): i is ItemDoMenu => Boolean(i));
    if (escolhidos.length > 0) return escolhidos.slice(0, 8);
    return SUGERIDOS.map((h) => porHref.get(h)).filter((i): i is ItemDoMenu => Boolean(i)).slice(0, 8);
  }, [favoritos, porHref]);

  if (itens.length === 0) return null;
  const personalizado = favoritos.length > 0;

  return (
    <section>
      <h2 className="mb-2 flex items-center gap-1.5 sgo-type-11 font-semibold text-ink-500">
        Acessos rápidos
        {personalizado && <Star className="h-3 w-3 fill-brand text-brand" aria-hidden />}
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {itens.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className="flex min-h-14 items-center rounded-card border border-line bg-surface px-3 py-2.5 text-sm font-semibold text-ink-900 outline-none transition-colors duration-sgo-1 ease-sgo-std hover:border-brand focus-visible:shadow-sgo-focus"
          >
            <span className="min-w-0 truncate">{i.label}</span>
          </Link>
        ))}
        <Link
          href="/modulos"
          className="flex min-h-14 items-center gap-2 rounded-card border border-dashed border-line-strong px-3 py-2.5 text-sm font-semibold text-ink-500 outline-none transition-colors duration-sgo-1 ease-sgo-std hover:border-brand hover:text-brand focus-visible:shadow-sgo-focus"
        >
          <LayoutGrid className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">Todos os módulos</span>
        </Link>
      </div>
      {!personalizado && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-500">
          <Star className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden />
          Em “Todos os módulos”, toque na estrela para trocar estes atalhos pelos seus.
        </p>
      )}
    </section>
  );
}
