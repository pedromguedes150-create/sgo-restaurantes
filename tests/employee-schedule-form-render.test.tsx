import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/pessoas',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { EmployeeScheduleForm } from '@/components/schedule/employee-schedule-form';

type Props = React.ComponentProps<typeof EmployeeScheduleForm>;

/**
 * A folha de escala aberta DENTRO do colaborador.
 *
 * Relato: "não está gravando". A rota grava (há teste chamando-a com o corpo
 * exato da folha), então o que sobrava era a tela: o botão "Salvar escala"
 * ficava no fim de um formulário que ROLA dentro da folha — quem preenchia
 * tudo não via mais nada para clicar. E a folha abria com os padrões (Domingo,
 * hoje) mesmo para quem já tinha escala cadastrada, o que fazia qualquer
 * gravação trocar a folga da pessoa sem ela pedir.
 */

const tipos = [
  { id: 't-6x1', name: '6x1', workDays: 6, offDays: 1, startTime: '14:00', breakTime: '19:00', endTime: '22:17' },
  { id: 't-12x36', name: '12x36', workDays: 1, offDays: 1, startTime: null, breakTime: null, endTime: null },
];

function render(over: Partial<Props> = {}) {
  const props = {
    unitId: 'u1',
    pessoas: [{ id: 'c1', name: 'ALESSANDRA CRUZ DA SILVA' }],
    tipos,
    turnos: [],
    busy: false,
    post: async () => true,
    ...over,
  } as Props;
  return renderToString(React.createElement(EmployeeScheduleForm, props)).split('<!-- -->').join('');
}

describe('O botão de salvar não pode depender de rolagem', () => {
  it('dentro do colaborador, a barra de ação fica grudada no fim da folha', () => {
    const html = render({ pessoaFixa: { id: 'c1', name: 'ALESSANDRA' } });
    expect(html).toContain('sticky bottom-0');
    expect(html).toContain('Salvar escala');
  });

  it('no formulário solto da tela de Escala, nada muda', () => {
    const html = render();
    expect(html).not.toContain('sticky bottom-0');
    expect(html).toContain('Salvar escala');
  });
});

describe('A folha abre com o que já está cadastrado', () => {
  const atual = {
    templateId: 't-6x1',
    offMode: 'FIXED_WEEKLY' as const,
    weeklyOffDay: 4, // quinta
    sundayEveryWeeks: null,
    shiftId: null,
    startTime: '14:00',
    breakTime: '19:00',
    endTime: '22:17',
  };

  it('traz o dia de folga da pessoa, e não o padrão', () => {
    /* ALESSANDRA folga QUINTA desde agosto. Abrindo em "Domingo", quem só
       quisesse corrigir o horário trocava a folga dela sem perceber. */
    const html = render({ pessoaFixa: { id: 'c1', name: 'ALESSANDRA' }, atual });
    expect(html).toContain('Quinta');
    expect(html).toContain('14:00');
    expect(html).toContain('22:17');
  });

  it('sem nada cadastrado, segue nos padrões', () => {
    const html = render({ pessoaFixa: { id: 'c1', name: 'ALESSANDRA' }, atual: null });
    expect(html).toContain('Domingo');
  });
});
