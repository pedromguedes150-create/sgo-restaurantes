'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Star, LayoutGrid, ChevronRight } from 'lucide-react';
import { useFavoritos } from '@/components/layout/favoritos';
import { ICONES_DE_AREA } from '@/components/layout/icones-de-area';
import { Card, PanelHeader } from '@/components/sgo/panel';
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
 *
 * Kit (Fase 4): painel com cabeçalho e linhas `.sgo-row` em duas colunas, cada
 * uma com a cápsula do ícone da ÁREA a que a tela pertence (o catálogo de menu
 * não tem ícone por tela). A altura mínima de 48px é do Restaurante — o
 * gerente abre isto no celular, com o dedo.
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
    () => new Map(areas.flatMap((a) => a.colunas.flatMap((c) => c.itens.map((i) => [i.href, { item: i, icone: a.icone }] as const)))),
    [areas],
  );

  const itens = useMemo<{ item: ItemDoMenu; icone: string }[]>(() => {
    /* Favorito de tela que a pessoa deixou de poder abrir some daqui sem ser
       apagado: devolver a permissão traz o atalho de volta. */
    const escolhidos = favoritos.map((h) => porHref.get(h)).filter((i): i is { item: ItemDoMenu; icone: string } => Boolean(i));
    if (escolhidos.length > 0) return escolhidos.slice(0, 8);
    return SUGERIDOS.map((h) => porHref.get(h)).filter((i): i is { item: ItemDoMenu; icone: string } => Boolean(i)).slice(0, 8);
  }, [favoritos, porHref]);

  if (itens.length === 0) return null;
  const personalizado = favoritos.length > 0;

  return (
    <section>
      <Card data-testid="acessos-rapidos">
        <PanelHeader
          title={<>Acessos rápidos{personalizado && <Star className="h-3 w-3 fill-brand text-brand" aria-hidden />}</>}
          icon={<span className="sgo-panel__ic sgo-panel__ic--brand" aria-hidden><LayoutGrid className="h-4 w-4" /></span>}
          action={<Link href="/modulos" className="sgo-link">Todos os módulos</Link>}
        />
        <div className="grid grid-cols-1 gap-1 p-2 sm:grid-cols-2">
          {itens.map(({ item, icone }) => {
            const Icone = ICONES_DE_AREA[icone] ?? LayoutGrid;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="sgo-row group min-h-12 outline-none focus-visible:shadow-sgo-focus"
                style={{ borderTop: 0 }}
              >
                <span className="sgo-ric sgo-ric--blue" aria-hidden><Icone className="h-4 w-4" /></span>
                <span className="sgo-row__main"><span className="sgo-row__title">{item.label}</span></span>
                <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-sgo-1 ease-sgo-std group-hover:translate-x-0.5" style={{ color: 'var(--sgo-ink-3)' }} aria-hidden />
              </Link>
            );
          })}
        </div>
        {!personalizado && (
          <p className="flex items-center gap-1.5 px-4 pb-3 text-xs" style={{ color: 'var(--sgo-ink-2)' }}>
            <Star className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Em “Todos os módulos”, toque na estrela para trocar estes atalhos pelos seus.
          </p>
        )}
      </Card>
    </section>
  );
}
