import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/tarefas/abc',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { ChecklistRunner } from '@/components/tasks/checklist-runner';

/**
 * A TELA do checklist depois da separação.
 *
 * O que se mede aqui é o que o gerente vê: os cinco status, o botão de abrir
 * ocorrência **opcional** e só onde faz sentido, e o crachá clicável quando já
 * existe uma. Botão que aparece e servidor que recusa (ou o contrário) é o
 * defeito clássico deste tipo de mudança.
 */

const ITENS = [
  { id: 'i1', section: null, text: 'Lâmpada da produção', requiresPhoto: false, aiCheck: false },
  { id: 'i2', section: null, text: 'Conferir estoque', requiresPhoto: false, aiCheck: false },
];

const TIPOS = [
  { id: 't1', name: 'Manutenção', isMaintenance: true, isIT: false, categories: [{ id: 'c1', name: 'Elétrica' }] },
  { id: 't2', name: 'T.I.', isMaintenance: false, isIT: true, categories: [] },
];

type Props = React.ComponentProps<typeof ChecklistRunner>;

function render(over: Partial<Props> = {}) {
  const props = {
    instanceId: 'inst-1',
    requiresEvidence: false,
    done: false,
    lateStatus: false,
    items: ITENS,
    initialAnswers: {},
    photos: [],
    unitId: 'u1',
    checklistName: 'Abertura do salão',
    occurrenceTypes: TIPOS,
    podeAbrirOcorrencia: true,
    ...over,
  } as Props;
  return renderToString(React.createElement(ChecklistRunner, props)).split('<!-- -->').join('');
}

describe('Os cinco status', () => {
  it('a tela oferece os cinco, com "Não realizado" entre eles', () => {
    const html = render();
    for (const label of ['De acordo', 'Não realizado', 'Em correção', 'A corrigir', 'Não se aplica']) {
      expect(html, label).toContain(label);
    }
  });
});

describe('O botão de abrir ocorrência', () => {
  it('aparece nos status de problema — e é opcional, não uma etapa obrigatória', () => {
    const html = render({ initialAnswers: { i1: { status: 'A_CORRIGIR' } } });
    expect(html).toContain('+ Abrir ocorrência');
  });

  it('também no "Não realizado" e no "Em correção"', () => {
    expect(render({ initialAnswers: { i1: { status: 'NAO_REALIZADO' } } })).toContain('+ Abrir ocorrência');
    expect(render({ initialAnswers: { i1: { status: 'EM_CORRECAO' } } })).toContain('+ Abrir ocorrência');
  });

  it('NÃO aparece em "De acordo" nem em "Não se aplica" — não há problema a relatar', () => {
    expect(render({ initialAnswers: { i1: { status: 'OK' } } })).not.toContain('+ Abrir ocorrência');
    expect(render({ initialAnswers: { i1: { status: 'NAO_SE_APLICA' } } })).not.toContain('+ Abrir ocorrência');
  });

  it('nem enquanto nenhum status foi escolhido', () => {
    expect(render()).not.toContain('+ Abrir ocorrência');
  });

  it('some para quem não pode registrar ocorrência — a tela não oferece o que a rota recusa', () => {
    const html = render({ initialAnswers: { i1: { status: 'A_CORRIGIR' } }, podeAbrirOcorrencia: false });
    expect(html).not.toContain('+ Abrir ocorrência');
  });
});

describe('Quando já existe ocorrência para o item', () => {
  const comAberta = {
    initialAnswers: { i1: { status: 'A_CORRIGIR' } },
    openIssues: {
      i1: { id: 'occ-1', number: 123, destinoLabel: 'Manutenção', href: '/modulos/ocorrencias/occ-1', desde: '10/09/2026' },
    },
  };

  it('mostra o número E o destino, como pedido', () => {
    const html = render(comAberta);
    expect(html).toContain('Ocorrência nº 123 aberta');
    expect(html).toContain('Manutenção');
  });

  it('e leva direto para ela — número solto obrigava a procurar na outra tela', () => {
    expect(render(comAberta)).toContain('/modulos/ocorrencias/occ-1');
  });

  it('o botão de abrir some: uma pendência, uma ocorrência', () => {
    expect(render(comAberta)).not.toContain('+ Abrir ocorrência');
  });

  it('mas só para o item dela — o outro item segue podendo abrir', () => {
    const html = render({ ...comAberta, initialAnswers: { i1: { status: 'A_CORRIGIR' }, i2: { status: 'A_CORRIGIR' } } });
    expect(html).toContain('+ Abrir ocorrência');
    expect(html).toContain('Ocorrência nº 123 aberta');
  });
});

describe('A observação do item', () => {
  it('aparece nos três status de problema', () => {
    for (const s of ['NAO_REALIZADO', 'EM_CORRECAO', 'A_CORRIGIR']) {
      expect(render({ initialAnswers: { i1: { status: s } } }), s).toContain('Observação (o que corrigir)');
    }
  });
});
