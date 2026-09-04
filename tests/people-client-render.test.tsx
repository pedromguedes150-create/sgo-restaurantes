import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/pessoas',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { PeopleClient } from '@/components/people/people-client';

type Props = React.ComponentProps<typeof PeopleClient>;

/**
 * A lista de Pessoas depois do relato: "a lista de colaboradores deve ser de
 * acordo com a unidade selecionada" e "o cadastro da escala deve ser dentro do
 * colaborador".
 */

const pessoa = (nome: string, unidade: string) => ({
  id: `c-${nome}`, name: nome, jobTitle: 'Cozinheiro(a)', units: [unidade], unitIds: [`u-${unidade}`],
});

function render(over: Partial<Props> = {}) {
  const props = {
    collaborators: [pessoa('ADAIR', 'Moreira'), pessoa('ADIL', 'Moreira')],
    vacations: [],
    schedule: [],
    canRequestVacation: true,
    ...over,
  } as Props;
  return renderToString(React.createElement(PeopleClient, props)).split('<!-- -->').join('');
}

describe('De qual unidade é a lista', () => {
  it('diz a unidade filtrada e oferece ver todas', () => {
    const html = render({ filtradoPor: ['Moreira'] });
    expect(html).toContain('Moreira');
    expect(html).toContain('Ver todas as unidades');
    expect(html).toContain('?unit=todas');
  });

  it('sem filtro, diz que está mostrando todas', () => {
    const html = render({ filtradoPor: [] });
    expect(html).toContain('todas as unidades');
    expect(html).not.toContain('Ver todas as unidades');
  });

  it('avisa quando a lista foi cortada pelo teto', () => {
    /* O 200 solto cortava calado: a tela mostrava 200 de 340 e ninguém sabia. */
    const html = render({ total: 340, limite: 2 });
    expect(html).toContain('lista cortada em 2 de 340');
  });
});

describe('A escala aparece na linha do colaborador', () => {
  it('mostra o que está cadastrado', () => {
    const html = render({
      configs: { 'c-ADAIR': {
        tipo: '6x1 Tarde', folga: 'folga domingo', desde: '01/09/2026', horario: '14:00–22:00',
        atual: { templateId: 't1', offMode: 'FIXED_WEEKLY' as const, weeklyOffDay: 0, sundayOfMonth: null, shiftId: null, startTime: '14:00', breakTime: null, endTime: '22:00' },
      } },
    });
    expect(html).toContain('6x1 Tarde');
    expect(html).toContain('folga domingo');
    expect(html).toContain('desde 01/09/2026');
  });

  it('e acusa quem está sem escala — é o que trava a grade de presença', () => {
    const html = render({ configs: {} });
    expect(html).toContain('Sem escala cadastrada');
  });
});

describe('Cadastrar a escala dentro do colaborador', () => {
  it('quem pode configurar recebe a linha clicável', () => {
    const html = render({ podeConfigurar: true });
    expect(html).toContain('<button');
  });

  it('quem não pode continua vendo a lista, sem o atalho', () => {
    const html = render({ podeConfigurar: false });
    /* O trilho de abas usa botões; o que não pode existir é o da linha. */
    expect(html).not.toContain('ADAIR</p>\n');
    expect(html).toContain('ADAIR');
  });
});
