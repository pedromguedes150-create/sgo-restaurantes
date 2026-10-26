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
    sundayOfMonth: 3,
    shiftId: null,
    startTime: '14:00',
    breakTime: '19:00',
    endTime: '22:17',
    anchorDate: '2026-08-02',
    startDate: '2026-08-03',
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

describe('Reabrir a escala mostra o que foi gravado (v1.178.2)', () => {
  /* Print do Pedro (26/10/2026): BRENDA é 12x36 com início do ciclo em
     01/10, mas ao reabrir a folha o "Início do ciclo" vinha vazio e "a partir
     de quando" vinha em hoje — como se nada tivesse sido gravado. */
  const brenda = {
    templateId: 't-12x36',
    offMode: 'CYCLE_ONLY' as const,
    weeklyOffDay: null,
    sundayOfMonth: null,
    shiftId: null,
    startTime: '14:00',
    breakTime: '19:00',
    endTime: '22:17',
    anchorDate: '2026-10-01',
    startDate: '2026-09-30',
  };

  it('12x36: o início do ciclo e a vigência voltam preenchidos', () => {
    const html = render({ pessoaFixa: { id: 'c1', name: 'BRENDA' }, atual: brenda });
    expect(html).toContain('01/10/2026');
    expect(html).toContain('30/09/2026');
    expect(html).toContain('vigente desde');
  });

  it('12x36: explica que a conta é em dias corridos e mostra a virada ímpar → par', () => {
    const html = render({ pessoaFixa: { id: 'c1', name: 'BRENDA' }, atual: brenda });
    expect(html).toContain('data-testid="explicacao-12x36"');
    expect(html).toContain('não pelos dias pares ou');
    /* A prévia parte do maior entre a vigência e o início do ciclo (01/10):
       1, 3, 5, 7, 9, 11 de outubro — os ímpares, como a Brenda trabalha. */
    expect(html).toContain('01/10/2026 · 03/10/2026 · 05/10/2026 · 07/10/2026 · 09/10/2026 · 11/10/2026');
  });

  it('6x1: o início do ciclo NÃO é reaproveitado (a âncora ali é calculada do dia fixo)', () => {
    const html = render({ pessoaFixa: { id: 'c1', name: 'ALESSANDRA' }, atual: { ...brenda, templateId: 't-6x1', offMode: 'FIXED_WEEKLY', weeklyOffDay: 4 } });
    expect(html).not.toContain('data-testid="previa-do-ciclo"');
    expect(html).toContain('30/09/2026'); // a vigência continua
  });

  it('sem escala gravada, nada de "vigente desde"', () => {
    const html = render({ pessoaFixa: { id: 'c1', name: 'ALESSANDRA' }, atual: null });
    expect(html).not.toContain('vigente desde');
  });
});
