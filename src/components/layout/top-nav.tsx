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
import { textoDaPendencia, type Pendencias } from '@/lib/nav/pendencias-puro';

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

function DropdownItem({ area, ativa, ativo, badge, pendencias }: { area: AreaMontada; ativa: boolean; ativo: (href: string) => boolean; badge?: number; pendencias: Pendencias }) {
  const [open, setOpen] = useState(false);
  const fechar = useRef<number>();
  const raiz = useRef<HTMLDivElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  /* Deslocamento horizontal que mantém o painel INTEIRO na tela (16px de
     respiro dos dois lados). Alinhar à direita do botão, como antes, jogava o
     painel largo de Administrativo para fora da borda esquerda. */
  const [dx, setDx] = useState(0);
  const dxAtual = useRef(0); // o efeito lê o deslocamento atual sem depender dele

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
    const base = r.left - dxAtual.current; // posição com deslocamento zero
    let novo = Math.min(0, window.innerWidth - 16 - (base + r.width));
    if (base + novo < 16) novo = 16 - base;
    if (novo !== dxAtual.current) { dxAtual.current = novo; setDx(novo); }
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
            position: 'absolute', left: dx,
            top: 'calc(100% + 10px)', zIndex: 'var(--sgo-z-dropdown)' as unknown as number,
            /* Largura pela quantidade de colunas (240px cada) e nunca maior que a
               tela: nome longo QUEBRA LINHA dentro da coluna (v1.154.0) — antes
               ele era cortado ou invadia a coluna vizinha. */
            width: mega ? colunas.length * 240 : 260,
            maxWidth: 'calc(100vw - 32px)',
            transformOrigin: 'top left',
            boxShadow: 'var(--sgo-sh-pop)', color: 'var(--sgo-ink)',
          }}
        >
          <div className={cn('grid gap-x-1 p-2', !mega && 'p-1.5')} style={mega ? { gridTemplateColumns: `repeat(${colunas.length}, minmax(0, 1fr))` } : undefined} data-testid="mega-menu">
            {colunas.map((coluna, i) => (
              <div key={coluna.titulo} className={cn('min-w-0', mega && i < colunas.length - 1 && 'mr-1 border-r border-[var(--sgo-hair)] pr-2')}>
                {mega && <div className="sgo-kpi__label px-2.5 pb-1.5 pt-1">{coluna.titulo}</div>}
                <ul className="grid grid-cols-1 gap-px">
                  {coluna.itens.map((item) => {
                    const n = pendencias[item.key] ?? 0;
                    return (
                    <li key={item.href} className="group/item flex min-w-0 items-center gap-1">
                      <Link href={item.href} onClick={() => setOpen(false)} title={n ? textoDaPendencia(item.key, n) : undefined}
                        className={cn(NAV_CHILD, 'min-w-0 flex-1', ativo(item.href) ? NAV_CHILD_ACTIVE : NAV_CHILD_IDLE)}>
                        <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug">{item.label}</span>
                        {n > 0 && <span className="sgo-count sgo-count--red shrink-0" data-testid={`pendencia-${item.key}`} aria-label={textoDaPendencia(item.key, n)}>{n > 99 ? '99+' : n}</span>}
                      </Link>
                      <FavoriteStar href={item.href} label={item.label} className="opacity-0 transition-opacity duration-sgo-1 ease-sgo-std group-hover/item:opacity-100 group-focus-within/item:opacity-100" />
                    </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function TopNav({ areas, badges = {}, pendencias = {} }: {
  areas: AreaMontada[];
  /** Pendências por área (chave = id da área) — o selo da barra. */
  badges?: Record<string, number>;
  /** Pendências por módulo (chave = MODULES[].key) — o selo do item no painel. */
  pendencias?: Pendencias;
}) {
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
        return <DropdownItem key={area.id} area={area} ativa={estaAtiva} ativo={ativo} badge={badges[area.id]} pendencias={pendencias} />;
      })}
    </nav>
  );
}
