import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/ocorrencias',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { OccurrencesClient, type OccItem } from '@/components/occurrences/occurrences-client';
import type { FiltrosDaLista } from '@/lib/occurrences/contexto';

const item = (p: Partial<OccItem> & { id: string }): OccItem => ({
  number: 57, unitName: 'Vivendas', unitCode: 'VIV', typeName: 'Padrão', categoryName: 'Placas',
  description: 'Verificar se as placas promocionais estão no lugar', gravity: 'MEDIUM', status: 'OPEN',
  isRecurrence: false, attachments: 0, createdAt: '2026-09-10T23:21:00.000Z', origemChecklist: true, andamento: null, ...p,
});
const filtros = (p: Partial<FiltrosDaLista> = {}): FiltrosDaLista => ({ pagina: 1, ordem: 'recentes', ...p });
const unidades = [{ id: 'u1', name: 'Vivendas' }, { id: 'u2', name: 'Moreira' }];
const render = (props: Partial<React.ComponentProps<typeof OccurrencesClient>>) =>
  renderToString(React.createElement(OccurrencesClient, { items: [], filtros: filtros(), unidades, tipos: [], podeTratar: true, totalNaPagina: 0, ...props }));

describe('Lista de ocorrências — tratamento do supervisor (v1.128.0)', () => {
  it('em Abertas, quem trata vê checkbox por ocorrência, "Selecionar visíveis" e a ação rápida', () => {
    const html = render({ items: [item({ id: 'a' })], filtros: filtros({ status: 'OPEN', unitId: 'u1', gravity: 'MEDIUM' }), totalNaPagina: 1 });
    expect(html).toContain('Selecionar #VIV-0057');
    expect(html).toContain('Selecionar visíveis');
    expect(html).toContain('Marcar em andamento');
    expect(html).toContain('Ver detalhes');
    expect(html).toContain('Origem: Checklist');
  });

  it('o link do cartão leva o contexto da lista em voltar= — é o que traz o supervisor de volta a Abertas', () => {
    const html = render({ items: [item({ id: 'a' })], filtros: filtros({ status: 'OPEN', unitId: 'u1', gravity: 'MEDIUM', q: 'placa' }), totalNaPagina: 1 });
    const voltar = encodeURIComponent('/modulos/ocorrencias?status=OPEN&q=placa&unidade=u1&gravidade=MEDIUM');
    expect(html).toContain(`/modulos/ocorrencias/a?voltar=${voltar}`);
  });

  it('quem não trata (gerente) não vê checkbox nem ação rápida; em Encerradas ninguém vê', () => {
    const gerente = render({ items: [item({ id: 'a' })], filtros: filtros({ status: 'OPEN' }), podeTratar: false, totalNaPagina: 1 });
    expect(gerente).not.toContain('Selecionar #VIV-0057');
    expect(gerente).not.toContain('Marcar em andamento');
    const encerradas = render({ items: [item({ id: 'a', status: 'CLOSED' })], filtros: filtros({ status: 'CLOSED' }), totalNaPagina: 1 });
    expect(encerradas).not.toContain('Selecionar visíveis');
    expect(encerradas).not.toContain('Ordenar');
  });

  it('em andamento mostra responsável e desde quando', () => {
    const html = render({ items: [item({ id: 'a', status: 'IN_PROGRESS', andamento: { nome: 'Supervisora Ana', em: '2026-09-11T08:35:00.000Z' } })], filtros: filtros({ status: 'IN_PROGRESS' }), totalNaPagina: 1 });
    expect(html).toContain('Responsável:');
    expect(html).toContain('Supervisora Ana');
    expect(html).toContain('Desde:');
    expect(html).not.toContain('>Marcar em andamento<'); // já está em andamento: sem ação rápida
  });

  it('com várias unidades, os grupos abrem já expandidos quando há lote (senão o checkbox fica escondido)', () => {
    const html = render({ items: [item({ id: 'a' }), item({ id: 'b', unitName: 'Moreira', unitCode: 'MOR' })], filtros: filtros({ status: 'OPEN' }), totalNaPagina: 2 });
    expect(html).toContain('<details');
    expect(html).toContain('open=""');
  });
});
