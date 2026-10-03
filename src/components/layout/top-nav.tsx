'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FavoriteStar } from '@/components/layout/favoritos';
import { ICONES_DE_AREA } from '@/components/layout/icones-de-area';
import { NavBadge } from '@/components/sgo/nav-badge';
import type { AreaMontada } from '@/lib/nav/areas';

/**
 * BARRA DE MÓDULOS do kit de layout (2-moldura/TopNav.tsx), com as áreas do
 * Restaurante.
 *
 * Cada área é um item em formato de tab bar — ícone de 20px em cima, nome em
 * 12px embaixo (`.sgo-navitem`); o ativo vira pílula na tinta da marca. Área
 * com UM destino é link direto; as demais abrem um painel sólido
 * (`.sgo-panel--solid`) com as colunas do catálogo — o mega-menu do kit. Abre
 * no hover (fecha 120ms depois de sair) e no clique; mousedown fora e Esc fecham.
 *
 * O que é do Restaurante: `areas` chega pronto do servidor (catálogo +
 * matriz de perfis + recorte da pizzaria) — nada de permissão aqui. Os selos
 * (`badge`) por área ligam na Fase 3.
 *
 * Só em `lg` (≥1024px), como no kit. Abaixo disso quem navega é o menu móvel
 * (hambúrguer) e, no celular, a barra de baixo.
 */
const NAV_CHILD = 'flex items-center gap-2 rounded-[var(--sgo-r-sm)] px-2.5 py-1.5 text-[12.5px] transition-colors duration-200';
const NAV_CHILD_ACTIVE = 'bg-[var(--sgo-accent-soft)] text-[var(--sgo-accent)] font-semibold';
const NAV_CHILD_IDLE = 'text-[var(--sgo-ink-2)] hover:text-[var(--sgo-ink)] hover:bg-[var(--sgo-panel-2)]';

function NavItemContent({ area, badge }: { area: AreaMontada; badge?: number }) {
  const Icone = ICONES_DE_AREA[area.icone] ?? LayoutGrid;
  return (
    <>
      <span className="sgo-navitem__ic">
        <Icone />
        <NavBadge count={badge ?? 0} />
      </span>
      <span className="sgo-navitem__label">{area.titulo}</span>
    </>
  );
}

function DropdownItem({ area, ativa, ativo, badge }: { area: AreaMontada; ativa: boolean; ativo: (href: string) => boolean; badge?: number }) {
  const [open, setOpen] = useState(false);
  const fechar = useRef<number>();
  const raiz = useRef<HTMLDivElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const [align, setAlign] = useState<'left' | 'right'>('left');

  const entrar = () => { window.clearTimeout(fechar.current); setOpen(true); };
  const sair = () => { fechar.current = window.setTimeout(() => setOpen(false), 120); };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  useEffect(() => () => window.clearTimeout(fechar.current), []);

  // Painéis largos podem vazar pela borda direita em áreas perto do fim da
  // barra — mede e alinha à direita se preciso.
  useLayoutEffect(() => {
    if (!open || !painel.current) return;
    const r = painel.current.getBoundingClientRect();
    setAlign(r.right > window.innerWidth - 8 ? 'right' : 'left');
  }, [open]);

  const colunas = area.colunas;
  const mega = colunas.length >= 2;

  return (
    <div ref={raiz} className="relative" onMouseEnter={entrar} onMouseLeave={sair}>
      <button type="button" onClick={() => setOpen((v) => !v)} className={cn('sgo-navitem', (ativa || open) && 'on')} aria-expanded={open} aria-haspopup="true">
        <NavItemContent area={area} badge={badge} />
      </button>
      {open && (
        <div
          ref={painel}
          className="sgo-panel sgo-panel--solid sgo-navpanel-enter overflow-hidden"
          style={{
            position: 'absolute', left: align === 'left' ? 0 : 'auto', right: align === 'right' ? 0 : 'auto',
            top: 'calc(100% + 10px)', zIndex: 'var(--sgo-z-dropdown)' as unknown as number,
            minWidth: mega ? Math.min(colunas.length * 240, 720) : 240,
            transformOrigin: align === 'left' ? 'top left' : 'top right',
            boxShadow: 'var(--sgo-sh-pop)', color: 'var(--sgo-ink)',
          }}
        >
          <div className={cn('grid gap-x-1 p-2', !mega && 'p-1.5')} style={mega ? { gridTemplateColumns: `repeat(${colunas.length}, minmax(0, 1fr))` } : undefined}>
            {colunas.map((coluna, i) => (
              <div key={coluna.titulo} className={cn('min-w-0', mega && i < colunas.length - 1 && 'mr-1 border-r border-[var(--sgo-hair)] pr-2')}>
                {mega && <div className="sgo-kpi__label px-2.5 pb-1.5 pt-1">{coluna.titulo}</div>}
                <ul className="grid gap-px">
                  {coluna.itens.map((item) => (
                    <li key={item.href} className="group/item flex items-center gap-1">
                      <Link href={item.href} onClick={() => setOpen(false)} className={cn(NAV_CHILD, 'min-w-0 flex-1', ativo(item.href) ? NAV_CHILD_ACTIVE : NAV_CHILD_IDLE)}>
                        <span className="flex-1 truncate">{item.label}</span>
                      </Link>
                      <FavoriteStar href={item.href} label={item.label} className="opacity-0 transition-opacity duration-sgo-1 ease-sgo-std group-hover/item:opacity-100 group-focus-within/item:opacity-100" />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TopNav({ areas, badges = {} }: { areas: AreaMontada[]; /** Pendências por área (chave = id da área). */ badges?: Record<string, number> }) {
  const pathname = usePathname() ?? '';
  const ativo = (href: string) => pathname === href || pathname.startsWith(href + '/');
  const areaAtiva = areas.find((a) => a.colunas.some((c) => c.itens.some((i) => ativo(i.href))))?.id;

  if (areas.length === 0) return null;

  return (
    <nav className="hidden items-center gap-0.5 lg:flex print:hidden" aria-label="Áreas do sistema" data-testid="nav-topnav">
      {areas.map((area) => {
        const unica = area.colunas.length === 1 && area.colunas[0].itens.length === 1;
        const estaAtiva = area.id === areaAtiva;
        if (unica) {
          return (
            <Link key={area.id} href={area.colunas[0].itens[0].href} className={cn('sgo-navitem', estaAtiva && 'on')} aria-current={estaAtiva ? 'page' : undefined}>
              <NavItemContent area={area} badge={badges[area.id]} />
            </Link>
          );
        }
        return <DropdownItem key={area.id} area={area} ativa={estaAtiva} ativo={ativo} badge={badges[area.id]} />;
      })}
    </nav>
  );
}
