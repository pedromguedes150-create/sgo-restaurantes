import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/pessoas',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { PeopleClient } from '@/components/people/people-client';
import { PaymentsClient, type PayReq } from '@/components/payments/payments-client';
import { RelatoriosMenu } from '@/components/payments/relatorios-menu';
import { List, ListRow } from '@/components/ui/ds/list-row';
import { Group } from '@/components/ui/ds/group';

/**
 * FASE 4 DO KIT — lote 2: Pagamentos, Escala (teste próprio em
 * schedule-client-render) e Pessoas, mais os primitivos List/Group.
 *
 * O que se trava: o cabeçalho do kit com as abas de ESTADO (a ativa com
 * aria-current), as ações como `.sgo-btn`, as listas em painel sólido — e
 * que o que a tela DIZ não mudou (rótulos das abas, nota de unidade, ações).
 */
const semSeparadores = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');

describe('primitivos List e Group emitem o painel sólido do kit', () => {
  it('List é ul.sgo-panel--solid; Group idem (e some vazio)', () => {
    const l = semSeparadores(renderToString(<List><ListRow title="A" href="/a" /></List>));
    expect(l).toContain('<ul class="sgo-panel sgo-panel--solid overflow-hidden sgo-stagger">');
    expect(semSeparadores(renderToString(<Group><div>x</div></Group>))).toContain('sgo-group sgo-panel sgo-panel--solid');
    expect(renderToString(<Group>{[]}</Group>)).toBe('');
  });
});

describe('Pessoas no kit', () => {
  const props = {
    collaborators: [{ id: 'c1', name: 'ADAIR', jobTitle: 'Cozinheiro', units: ['Centro'], unitIds: ['u1'] }],
    vacations: [], schedule: [], canRequestVacation: true, podeConfigurar: true, podeEditarUnidades: true,
    subtitulo: 'Fonte primária: API do RH', ferramentas: <div data-testid="ferramentas">ferramentas</div>,
  };
  it('cabeçalho com as três abas (Colaboradores ativa), ferramentas abaixo da nota, lista em Group', () => {
    const h = semSeparadores(renderToString(<PeopleClient {...props} />));
    expect(h).toContain('<h1 class="sgo-phdr__title">Gestão de Pessoas</h1>');
    expect(h).toMatch(/class="sgo-phdr__tab on" aria-current="page"[^>]*data-testid="aba-col"/);
    expect(h).toContain('>Férias<');
    expect(h).toContain('>Escala<');
    expect(h).toContain('data-testid="ferramentas"');
    expect(h).toContain('sgo-group sgo-panel sgo-panel--solid');
    expect(h).toContain('ADAIR');
    expect(h).toContain('Editar unidades de ADAIR');
    /* Modais nascem fechados (portal só no cliente). */
    expect(h).not.toContain('sgo-modal__hdr');
  });
});

describe('Pagamentos no kit', () => {
  const req = (over: Partial<PayReq>): PayReq => ({
    id: 'r1', type: 'FREELANCER', status: 'PENDING', amount: 150, unit: 'Beija Flor Centro', unitId: 'u1', unitCode: 'C', requestedBy: 'Gabriel',
    title: 'João Garçom', rejectionReason: null, divergent: false, recurrent: false, weekCount: null, standardValue: null,
    requestedAt: '2026-10-02T10:00:00.000Z', entryDate: null, dateEdited: false, dateEditedByName: null, day: '2026-10-01', detail: null, ...over,
  } as PayReq);
  const base = {
    abas: { nova: { ver: true, editar: true }, minhas: { ver: true, editar: true }, aprovar: { ver: true, editar: true }, pagar: { ver: true, editar: true }, historico: { ver: true, editar: true } },
    podePagar: true, isAdmin: true, canEditDate: true,
    units: [{ id: 'u1', name: 'Beija Flor Centro' }, { id: 'u2', name: 'Beija Flor Orla' }],
    freelancers: [], miscTypes: [], suppliers: [], sectors: [],
    mine: [], toApprove: [req({})], toPay: [], history: [],
    totais: { mine: 0, toApprove: 1, toPay: 0, history: 0, unit: 0 }, limite: 100,
  };
  it('cabeçalho do kit com as abas e o crachá da fila; relatórios como .sgo-btn; filtro de tipo; lista em painel', () => {
    const h = semSeparadores(renderToString(
      <PaymentsClient {...(base as unknown as React.ComponentProps<typeof PaymentsClient>)} acoes={<RelatoriosMenu itens={[{ href: '/modulos/hora-extra', titulo: 'Hora extra', descricao: 'x' }]} />} />,
    ));
    expect(h).toContain('<h1 class="sgo-phdr__title">Pagamentos</h1>');
    expect(h).toMatch(/class="sgo-phdr__tab on" aria-current="page"[^>]*data-testid="aba-aprovar"/);
    expect(h).toContain('<span class="sgo-navbadge">1</span>');
    expect(h).toMatch(/<a title="x" class="sgo-btn" href="\/modulos\/hora-extra">/);
    expect(h).toContain('Tipo de pagamento');
    expect(h).toContain('sgo-panel sgo-panel--solid');
    expect(h).toContain('João Garçom');
    expect(h).not.toContain('sgo-drawer__plume');
  });
});
