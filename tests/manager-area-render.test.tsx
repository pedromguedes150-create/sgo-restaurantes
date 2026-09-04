import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/minha-area',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { ManagerAreaClient } from '@/components/manager-area/manager-area-client';
import type { AcessoAbas } from '@/lib/permissions/manager-area';

type Props = React.ComponentProps<typeof ManagerAreaClient>;

const aberta = { canView: true, canEdit: true };
const fechada = { canView: false, canEdit: false };
const soLeitura = { canView: true, canEdit: false };

function render(abas?: AcessoAbas) {
  const props = {
    tasks: [{ id: 't1', title: 'ligar para o fornecedor', notes: null, dueAt: null, done: false }],
    notes: [{ id: 'n1', title: 'Reunião', content: '<p>pauta</p>', createdAt: '2026-09-01T12:00:00.000Z' }],
    leaves: [{ id: 'l1', kind: 'FOLGA' as const, startDate: '2026-09-20', endDate: '2026-09-20', note: null }],
    schedule: { weekdays: [1, 2, 3], startTime: '10:00', endTime: '19:00', note: null },
    canSeeTeam: false,
    ...(abas ? { abas } : {}),
  } as Props;
  return renderToString(React.createElement(ManagerAreaClient, props)).split('<!-- -->').join('');
}

describe('Sem receber permissão nenhuma, a tela é a de sempre', () => {
  it('mostra as três abas', () => {
    const html = render();
    expect(html).toContain('Minhas tarefas');
    expect(html).toContain('Bloco de notas');
    expect(html).toContain('Folgas / férias');
  });
});

describe('Folgas/férias restrita para o perfil', () => {
  const abas: AcessoAbas = { tarefas: aberta, notas: aberta, folgas: fechada };

  it('a aba some da tela', () => {
    const html = render(abas);
    expect(html).not.toContain('Folgas / férias');
  });

  it('e as outras duas continuam lá', () => {
    const html = render(abas);
    expect(html).toContain('Minhas tarefas');
    expect(html).toContain('Bloco de notas');
  });

  it('a tela abre numa aba que existe — não numa em branco', () => {
    /* Com a primeira aba fechada, abrir em "tarefas" deixaria a tela vazia e
       pareceria defeito. */
    const html = render({ tarefas: fechada, notas: aberta, folgas: fechada });
    expect(html).toContain('Salvar nota');
    expect(html).not.toContain('Nova tarefa');
  });
});

describe('Aba aberta só para consulta', () => {
  it('não oferece o formulário, e diz por quê', () => {
    const html = render({ tarefas: soLeitura, notas: aberta, folgas: aberta });
    expect(html).toContain('Somente leitura');
    expect(html).not.toContain('Nova tarefa');
    /* a tarefa continua visível — é consulta, não sumiço */
    expect(html).toContain('ligar para o fornecedor');
  });

  it('nas folgas, o horário aparece sem os controles', () => {
    const html = render({ tarefas: fechada, notas: fechada, folgas: soLeitura });
    expect(html).toContain('Meu horário de trabalho');
    expect(html).not.toContain('Salvar horário');
    expect(html).not.toContain('Agendar');
  });
});

describe('Módulo sem nenhuma aba liberada', () => {
  it('diz o que houve, em vez de mostrar tela vazia', () => {
    const html = render({ tarefas: fechada, notas: fechada, folgas: fechada });
    expect(html).toContain('não tem acesso a nenhuma parte da Minha área');
  });
});
