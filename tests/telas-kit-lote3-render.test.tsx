import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/notas',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { NotesClient } from '@/components/notes/notes-client';
import { UnitTasksSection } from '@/components/tasks/unit-tasks-section';
import { OccurrencesClient } from '@/components/occurrences/occurrences-client';

/**
 * FASE 4 DO KIT — lote 3: Tarefas, Ocorrências, Notas (e Configurações, que
 * é página de servidor e só trocou de classes). O que se trava: as abas de
 * Notas no cabeçalho do kit (links com endereço, a ativa pela URL) e a ação
 * primária; a seção de tarefas por unidade como painel sólido; a lista de
 * ocorrências com filtros e cartões em painel e os botões do kit.
 */
const semSeparadores = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');

describe('Notas no kit', () => {
  it('cabeçalho com Notas/Vencimentos/Análise de gás (links, Vencimentos ativa) e "Nova nota" como primária', () => {
    const h = semSeparadores(renderToString(
      <NotesClient units={[{ id: 'u1', name: 'Centro' }]} notes={[]} aba="venc" sinceDays={90} canManage subtitulo="família" indicadores={<div data-testid="kpis" />} />,
    ));
    expect(h).toContain('<h1 class="sgo-phdr__title">Notas Recebidas</h1>');
    expect(h).toMatch(/class="sgo-phdr__tab on" aria-current="page"[^>]*href="\/modulos\/notas\?aba=venc&amp;dias=90"/);
    expect(h).toMatch(/class="sgo-phdr__tab" [^>]*href="\/modulos\/notas\?dias=90"/);
    expect(h).toContain('href="/modulos/notas/gas"');
    expect(h).toContain('Nova nota');
    expect(h).toContain('Importar em lote (XLSX)');
    expect(h).toContain('data-testid="kpis"');
    expect(h).not.toContain('sgo-modal__hdr');
  });
});

describe('Tarefas no kit', () => {
  it('a seção da unidade é o painel sólido do kit com o nome como título', () => {
    const h = semSeparadores(renderToString(
      <UnitTasksSection unitName="Centro" summary={{ total: 3, done: 1, late: 0, missed: 0, todo: 2 }} showSummary defaultOpen><li>t</li></UnitTasksSection>,
    ));
    expect(h).toContain('<section class="sgo-panel sgo-panel--solid">');
    expect(h).toContain('class="sgo-panel__title block">Centro<');
    expect(h).toContain('2 a fazer');
  });
});

describe('Ocorrências no kit', () => {
  it('filtros e cartões em painel, ações rápidas como .sgo-btn', () => {
    const h = semSeparadores(renderToString(
      <OccurrencesClient
        items={[{ id: 'a', number: 57, unitName: 'Beija Flor Centro', unitCode: 'VIV', typeName: 'Limpeza', categoryName: null, description: 'Chão molhado', gravity: 'HIGH', status: 'OPEN', isRecurrence: false, attachments: 0, createdAt: '2026-10-01T10:00:00.000Z', origemChecklist: false }]}
        filtros={{ status: 'OPEN', ordem: 'recentes', pagina: 1, q: '' } as never}
        unidades={[{ id: 'u1', name: 'Beija Flor Centro' }]}
        tipos={[]}
        podeTratar
        totalNaPagina={1}
      />,
    ));
    expect(h).toContain('sgo-panel sgo-panel--solid space-y-2 p-3');
    expect(h).toMatch(/class="sgo-btn sgo-btn--sm"[^>]*>Ver detalhes</);
    expect(h).toContain('Marcar em andamento');
    expect(h).toContain('#VIV-0057');
  });
});
