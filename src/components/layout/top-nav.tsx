'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Home, ListChecks, LayoutGrid, Users, BarChart3, FileText, Settings, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FavoriteStar } from '@/components/layout/favoritos';
import type { AreaMontada } from '@/lib/nav/areas';

const ICONES: Record<string, React.ComponentType<{ className?: string }>> = {
  home: Home, checks: ListChecks, grid: LayoutGrid, users: Users, chart: BarChart3, file: FileText, settings: Settings,
};

/**
 * NAVEGAÇÃO SUPERIOR POR ÁREAS — o desktop deixa de ter menu em coluna.
 *
 * A sidebar gastava 256px de largura permanente para mostrar onze entradas, e
 * o resto do sistema — Troco, Inventário, relatórios, as dezoito telas de
 * Configurações — vivia atrás de abas dentro de telas. Numa tela de 1440px isso
 * é muita largura paga por pouca navegação, e a sensação era a de que o sistema
 * escondia função.
 *
 * Aqui as sete áreas ficam sempre à vista e o MEGA MENU mostra tudo o que há
 * dentro de uma delas de uma vez — em colunas, que é como se lê uma lista de
 * trinta itens sem rolar. Área com um destino só vira link direto: abrir um
 * painel para mostrar uma linha seria menu dentro de menu.
 *
 * A barra vale de `md` (768px) para cima, e a barra de baixo some no mesmo
 * ponto: era ali que a sidebar antiga entrava. Quando a barra superior começava
 * só em `lg`, o TABLET ficava SEM NAVEGAÇÃO NENHUMA entre 768 e 1023px — nem
 * menu em cima, nem barra embaixo. No tablet os ícones e a seta saem: eles
 * custavam ~150px e faziam a sétima área (Administrativo) cair para fora.
 *
 * Abre no hover E no clique. Hover sozinho é armadilha em telas com toque e em
 * quem navega pelo teclado; clique sozinho custa um clique a mais em quem já
 * sabe onde vai.
 */
export function TopNav({ areas }: { areas: AreaMontada[] }) {
  const pathname = usePathname();
  const [aberta, setAberta] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const fechar = useRef<number>();

  const ativo = (href: string) => pathname === href || pathname.startsWith(href + '/');
  const areaAtiva = areas.find((a) => a.colunas.some((c) => c.itens.some((i) => ativo(i.href))))?.id;

  useEffect(() => { setAberta(null); }, [pathname]);

  useEffect(() => {
    if (!aberta) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setAberta(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberta(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [aberta]);

  /* Sair do botão e entrar no painel passa pelo vão entre os dois: fechar na
     hora faria o menu sumir no meio do caminho. */
  const adiarFechamento = () => { window.clearTimeout(fechar.current); fechar.current = window.setTimeout(() => setAberta(null), 160); };
  const cancelarFechamento = () => window.clearTimeout(fechar.current);

  if (areas.length === 0) return null;

  return (
    <div ref={ref} className="relative hidden border-b border-line bg-surface md:block print:hidden">
      <nav aria-label="Áreas do sistema" className="mx-auto w-full max-w-6xl px-4 lg:max-w-none lg:px-6 2xl:max-w-[1760px]">
        {/* `overflow-x-auto` é a REDE DE SEGURANÇA: no tablet as sete áreas
            chegam a não caber, e sem isto quem empurrava era a PÁGINA — a tela
            inteira passava a rolar de lado, que é justamente o que o design
            system proíbe. Aqui rola a tira, não o conteúdo. */}
        <ul className="flex items-stretch gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {areas.map((area) => {
            const Icone = ICONES[area.icone] ?? LayoutGrid;
            const unica = area.colunas.length === 1 && area.colunas[0].itens.length === 1;
            const estaAtiva = area.id === areaAtiva;
            const estaAberta = aberta === area.id;

            /* O ATIVO virou PÍLULA de tinta bordô, no lugar do sublinhado de
               2px que ia até a borda da barra — é o risco colado embaixo que
               dava ao menu cara de barra de sistema antigo. A pílula fica
               dentro da faixa, com ar em volta, e a marca aparece como
               superfície em vez de traço.
               O hover usa a MESMA tinta mais clara: o destino do ponteiro fica
               óbvio sem introduzir um cinza que não existe em lugar nenhum. */
            const visual = cn(
              'my-1.5 flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill px-3 text-sm font-medium outline-none transition-colors duration-sgo-1 ease-sgo-std focus-visible:shadow-sgo-focus',
              estaAtiva
                ? 'bg-brand-tint-2 font-semibold text-brand'
                : 'text-ink-700 hover:bg-brand-tint hover:text-brand',
            );

            if (unica) {
              return (
                <li key={area.id}>
                  <Link href={area.colunas[0].itens[0].href} className={visual} aria-current={estaAtiva ? 'page' : undefined}>
                    <Icone className={cn('hidden h-4 w-4 lg:inline', estaAtiva ? 'text-brand' : 'text-ink-500')} />
                    {area.titulo}
                  </Link>
                </li>
              );
            }

            return (
              <li key={area.id} onMouseEnter={() => { cancelarFechamento(); setAberta(area.id); }} onMouseLeave={adiarFechamento}>
                <button
                  type="button"
                  onClick={() => setAberta(estaAberta ? null : area.id)}
                  aria-expanded={estaAberta}
                  aria-haspopup="true"
                  className={visual}
                >
                  <Icone className={cn('hidden h-4 w-4 lg:inline', estaAtiva ? 'text-brand' : 'text-ink-500')} />
                  {area.titulo}
                  <ChevronDown className={cn('hidden h-3.5 w-3.5 transition-transform duration-sgo-1 ease-sgo-std motion-reduce:transition-none lg:inline', estaAtiva ? 'text-brand' : 'text-ink-400', estaAberta && 'rotate-180')} />
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {aberta && (
        <div
          onMouseEnter={cancelarFechamento}
          onMouseLeave={adiarFechamento}
          className="absolute inset-x-0 top-full z-40 rounded-b-card border-b border-line bg-surface shadow-sgo-pop"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-5 lg:max-w-none lg:px-6 2xl:max-w-[1760px]">
            <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-8">
              {areas.find((a) => a.id === aberta)!.colunas.map((coluna) => (
                <div key={coluna.titulo}>
                  <p className="mb-1.5 sgo-type-11 font-semibold text-ink-500">{coluna.titulo}</p>
                  <ul className="space-y-0.5">
                    {coluna.itens.map((item) => (
                      <li key={item.href} className="group/item flex items-center gap-1">
                        <Link
                          href={item.href}
                          className={cn(
                            'flex min-w-0 flex-1 items-center rounded-control px-2 py-1.5 text-sm outline-none transition-colors duration-sgo-1 ease-sgo-std focus-visible:shadow-sgo-focus',
                            ativo(item.href) ? 'bg-brand-tint-2 font-semibold text-brand' : 'text-ink-700 hover:bg-sunken hover:text-ink-900',
                          )}
                        >
                          <span className="truncate">{item.label}</span>
                        </Link>
                        {/* A estrela só aparece no hover/foco da linha: trinta
                            estrelas sempre visíveis competiriam com os rótulos,
                            que é o que a pessoa veio ler. */}
                        <FavoriteStar href={item.href} label={item.label} className="opacity-0 transition-opacity duration-sgo-1 ease-sgo-std group-hover/item:opacity-100 group-focus-within/item:opacity-100" />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
