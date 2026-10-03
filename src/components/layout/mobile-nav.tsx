'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, LayoutGrid, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBodyPortal, useDialogBehavior } from '@/components/ui/ds/modal';
import { ICONES_DE_AREA } from '@/components/layout/icones-de-area';
import type { AreaMontada } from '@/lib/nav/areas';

const STORAGE_KEY = 'sgo.navigation.openMenuGroups';

/**
 * MENU MÓVEL do kit de layout (2-moldura/MobileNav.tsx): o hambúrguer da barra
 * abre uma gaveta à esquerda (288px) com as áreas em grupos recolhíveis e, em
 * cada grupo, as colunas do catálogo. Os grupos abertos ficam no aparelho; a
 * área ativa abre sozinha; clicar num destino fecha a gaveta.
 *
 * Vale abaixo de `lg` (tablet e celular) — é o que cobre a faixa 768–1023px
 * em que a barra de módulos ainda não entra. No celular a barra de baixo
 * continua existindo para os quatro destinos mais usados.
 *
 * Adaptação: o kit usa o Sheet do Radix; aqui a gaveta é um diálogo do design
 * system (foco preso, Esc, clique fora, portal).
 */
export function MobileNav({ areas }: { areas: AreaMontada[] }) {
  const [open, setOpen] = useState(false);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const pathname = usePathname() ?? '';
  const ref = useRef<HTMLDivElement>(null);
  const show = useBodyPortal(open);
  useDialogBehavior(open, () => setOpen(false), ref);

  const ativo = (href: string) => pathname === href || pathname.startsWith(href + '/');
  const areaAtiva = areas.find((a) => a.colunas.some((c) => c.itens.some((i) => ativo(i.href))))?.id;

  useEffect(() => {
    try {
      const guardado = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
      if (guardado && typeof guardado === 'object') setAbertos(guardado);
    } catch { /* sem armazenamento: começa tudo fechado */ }
  }, []);
  useEffect(() => {
    if (!areaAtiva) return;
    setAbertos((a) => (a[areaAtiva] ? a : { ...a, [areaAtiva]: true }));
  }, [areaAtiva]);
  useEffect(() => { setOpen(false); }, [pathname]);

  const alternar = (id: string) => setAbertos((a) => {
    const n = { ...a, [id]: !a[id] };
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(n)); } catch { /* ok */ }
    return n;
  });

  return (
    <>
      <button type="button" className="sgo-btn sgo-btn--icon sgo-btn--ghost lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu" aria-expanded={open} data-testid="button-mobile-menu">
        <Menu className="h-5 w-5" />
      </button>
      {show && createPortal(
        <div className="fixed inset-0 flex bg-black/40 print:hidden" style={{ zIndex: 'var(--sgo-z-modal)' as unknown as number }} onClick={() => setOpen(false)}>
          <div ref={ref} role="dialog" aria-modal="true" aria-label="Menu" tabIndex={-1} onClick={(e) => e.stopPropagation()} className="sgo-app sgo-sheet-enter flex h-full w-72 max-w-[85vw] flex-col outline-none" style={{ background: 'var(--sgo-panel)', boxShadow: 'var(--sgo-sh-pop)' }}>
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: 'var(--sgo-hair)' }}>
              <span className="flex items-center gap-1.5">
                <span className="sgo-navlogo__mark"><img src="/sgo-bird-only.png" alt="" aria-hidden /></span>
                <span className="sgo-navlogo__word">SGO</span>
              </span>
              <button type="button" className="sgo-btn sgo-btn--icon sgo-btn--ghost" onClick={() => setOpen(false)} aria-label="Fechar menu"><X className="h-4 w-4" /></button>
            </div>
            <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3" aria-label="Áreas do sistema">
              {areas.map((area) => {
                const Icone = ICONES_DE_AREA[area.icone] ?? LayoutGrid;
                const unica = area.colunas.length === 1 && area.colunas[0].itens.length === 1;
                const estaAtiva = area.id === areaAtiva;
                if (unica) {
                  const item = area.colunas[0].itens[0];
                  return (
                    <Link key={area.id} href={item.href} className={cn('flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium', estaAtiva ? 'bg-[var(--sgo-accent-soft)] text-[var(--sgo-accent)]' : 'text-[var(--sgo-ink)]')}>
                      <Icone className="h-4 w-4" /> {area.titulo}
                    </Link>
                  );
                }
                const aberto = !!abertos[area.id];
                return (
                  <div key={area.id}>
                    <button type="button" onClick={() => alternar(area.id)} aria-expanded={aberto} className={cn('flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium', estaAtiva && !aberto ? 'bg-[var(--sgo-accent-soft)] text-[var(--sgo-accent)]' : 'text-[var(--sgo-ink)]')}>
                      <Icone className="h-4 w-4" />
                      <span className="flex-1 text-left">{area.titulo}</span>
                      <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', aberto && 'rotate-90')} />
                    </button>
                    {aberto && (
                      <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-[var(--sgo-hair)] pl-3">
                        {area.colunas.map((coluna) => (
                          <div key={coluna.titulo}>
                            {area.colunas.length > 1 && <div className="sgo-kpi__label px-2.5 pb-1 pt-2">{coluna.titulo}</div>}
                            {coluna.itens.map((item) => (
                              <Link key={item.href} href={item.href} className={cn('flex items-center gap-2 rounded-md px-2.5 py-2 text-xs', area.colunas.length > 1 && 'pl-4', ativo(item.href) ? 'bg-[var(--sgo-accent-soft)] font-semibold text-[var(--sgo-accent)]' : 'text-[var(--sgo-ink-2)]')}>
                                <span className="truncate">{item.label}</span>
                              </Link>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
