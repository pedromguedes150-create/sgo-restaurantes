import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/hora-extra',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { TopNav } from '@/components/layout/top-nav';
import { MobileNav } from '@/components/layout/mobile-nav';
import { SgoPageHeader } from '@/components/sgo/sgo-page-header';
import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import { NavBadge } from '@/components/sgo/nav-badge';
import { LargeTitle, PageChromeProvider } from '@/components/layout/page-chrome';
import type { AreaMontada } from '@/lib/nav/areas';

/**
 * A MOLDURA DO KIT DE LAYOUT, renderizada no servidor.
 *
 * O que se trava: as classes do kit (`.sgo-navitem`, `.sgo-phdr`, `.sgo-kpi`)
 * saem no HTML com a estrutura do kit; o item ativo é derivado da rota; o
 * título de página antigo (`LargeTitle`) passou a ser o cabeçalho do kit sem
 * mudar de assinatura; o selo não renderiza em zero.
 */
const semSeparadores = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');

const AREAS: AreaMontada[] = [
  { id: 'inicio', titulo: 'Início', icone: 'home', href: '/dashboard', colunas: [{ titulo: 'Meu painel', itens: [{ key: 'DASHBOARD', label: 'Dashboard', href: '/dashboard' }] }] },
  {
    id: 'pessoas', titulo: 'Pessoas', icone: 'users', href: '/modulos/pessoas',
    colunas: [
      { titulo: 'Equipe', itens: [{ key: 'PEOPLE', label: 'Pessoas', href: '/modulos/pessoas' }] },
      { titulo: 'Pagamentos', itens: [{ key: 'PAYMENTS', label: 'Pagamentos', href: '/modulos/pagamentos' }, { key: 'HORA_EXTRA', label: 'Hora extra', href: '/modulos/hora-extra' }] },
    ],
  },
];

describe('barra de módulos (TopNav)', () => {
  it('área com um destino vira link direto; a área da rota atual fica "on"; só em lg', () => {
    const h = semSeparadores(renderToString(<TopNav areas={AREAS} badges={{ pessoas: 3 }} />));
    expect(h).toContain('class="hidden items-center gap-0.5 lg:flex print:hidden"');
    expect(h).toMatch(/<a class="sgo-navitem" href="\/dashboard"/);
    expect(h).toMatch(/<button type="button" class="sgo-navitem on" aria-expanded="false"/);
    expect(h).toContain('sgo-navitem__label');
    expect(h).toContain('<span class="sgo-navbadge">3</span>');
    expect(h).not.toContain('bg-info');
  });
});

describe('menu móvel', () => {
  it('o hambúrguer existe abaixo de lg e a gaveta nasce fechada', () => {
    const h = semSeparadores(renderToString(<MobileNav areas={AREAS} />));
    expect(h).toContain('sgo-btn sgo-btn--icon sgo-btn--ghost lg:hidden');
    expect(h).not.toContain('role="dialog"');
  });
});

describe('cabeçalho de página e KPIs', () => {
  it('SgoPageHeader: título 20px do kit, abas com a ativa pela rota, ações à direita', () => {
    const h = semSeparadores(renderToString(
      <SgoPageHeader title="Hora extra" subtitle="Painel e fechamento" tabs={[{ label: 'Dashboard', href: '/modulos/hora-extra' }, { label: 'Fechamento', href: '/modulos/hora-extra?aba=fechamento', badge: 2 }]} actions={<button className="sgo-btn sgo-btn--primary">Nova</button>} />,
    ));
    expect(h).toContain('<header class="sgo-phdr">');
    expect(h).toContain('<h1 class="sgo-phdr__title">Hora extra</h1>');
    expect(h).toContain('class="sgo-phdr__sub"');
    expect(h).toMatch(/class="sgo-phdr__tab on" aria-current="page"[^>]*href="\/modulos\/hora-extra"/);
    expect(h).toContain('<span class="sgo-navbadge">2</span>');
    expect(h).toContain('<div class="sgo-phdr__actions">');
  });

  it('LargeTitle manteve a assinatura e passou a emitir o cabeçalho do kit', () => {
    const h = semSeparadores(renderToString(<PageChromeProvider><LargeTitle title="Pagamentos" subtitle="x" /></PageChromeProvider>));
    expect(h).toContain('<h1 class="sgo-phdr__title">Pagamentos</h1>');
    expect(h).not.toContain('sgo-type-34');
  });

  it('SgoKpi: cápsula no tom, valor e meta; sem ícone não há cápsula; selo zero não renderiza', () => {
    const h = semSeparadores(renderToString(<SgoKpis><SgoKpi label="Total pago" value="R$ 10,00" meta="+2%" metaTone="up" tone="green" /><SgoKpi label="Pendentes" value="0" /></SgoKpis>));
    expect(h).toContain('<div class="sgo-kpis">');
    expect(h).toContain('sgo-kpi__meta sgo-kpi__meta--up');
    expect(h).not.toContain('sgo-kpi__ic');
    expect(renderToString(<NavBadge count={0} />)).toBe('');
    expect(renderToString(<NavBadge count={120} />)).toContain('99+');
  });
});
