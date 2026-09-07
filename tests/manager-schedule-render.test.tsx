import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/escala-gerentes',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { ManagerScheduleClient } from '@/components/people/manager-schedule-client';
import type { GradeDeGerentes, CelulaDoGerente, LinhaDaGrade } from '@/lib/manager-schedule-central';

/**
 * A TELA da Escala de gerentes.
 *
 * O que se mede aqui é o que a grade afirma para quem olha: se o dia sem
 * gerente aparece, se o "sem horário" não passa por presença, e se o botão de
 * lançar só existe para quem o servidor deixa lançar — botão que aparece e
 * requisição que é recusada é o pior dos dois mundos.
 */

const WD_TODOS = [0, 1, 2, 3, 4, 5, 6];

function linha(name: string, dias: CelulaDoGerente[], over: Partial<LinhaDaGrade> = {}): LinhaDaGrade {
  return {
    userId: `u-${name}`, name, temHorario: true, weekdays: WD_TODOS,
    startTime: '10:00', endTime: '19:00', note: null, dias,
    diasTrabalhados: dias.filter((c) => c === 'TRABALHA').length,
    diasDeFolga: dias.filter((c) => c === 'FOLGA').length,
    diasDeFerias: dias.filter((c) => c === 'FERIAS').length,
    ...over,
  };
}

function grade(over: Partial<GradeDeGerentes> = {}): GradeDeGerentes {
  const dias = [1, 2, 3].map((day) => ({ day, weekday: day, iso: `2026-09-0${day}`, semGerente: false }));
  return {
    unitId: 'u1', unitName: 'Jardim Teresópolis', year: 2026, month: 9,
    dias,
    linhas: [linha('ALESSANDRA', ['TRABALHA', 'FOLGA', 'TRABALHA'])],
    lancamentos: [],
    diasSemGerente: 0,
    semHorarioCount: 0,
    ...over,
  };
}

const render = (g: GradeDeGerentes, podeEditar = true) =>
  renderToString(React.createElement(ManagerScheduleClient, { grade: g, units: [{ id: 'u1', name: 'Jardim Teresópolis' }], podeEditar }))
    .split('<!-- -->').join('');

describe('A grade na tela', () => {
  it('mostra o gerente, as siglas do dia e o resumo T/F/FE', () => {
    const html = render(grade());
    expect(html).toContain('ALESSANDRA');
    expect(html).toContain('2/1/0'); // 2 trabalhados, 1 folga, 0 férias
  });

  it('traz a legenda — sigla sem legenda não se lê', () => {
    const html = render(grade());
    expect(html).toContain('Folga lançada');
    expect(html).toContain('Férias');
    expect(html).toContain('Fora do padrão semanal');
    expect(html).toContain('Sem horário cadastrado');
  });

  it('avisa quantos dias ficaram sem nenhum gerente', () => {
    const g = grade();
    g.dias[1].semGerente = true;
    g.diasSemGerente = 1;
    const html = render(g);
    expect(html).toContain('1 dia(s) sem nenhum gerente');
    expect(html).toContain('Jardim Teresópolis');
  });

  it('sem horário cadastrado, a linha diz isso em vez de fingir presença', () => {
    const g = grade({
      linhas: [linha('BRUNO', ['SEM_HORARIO', 'SEM_HORARIO', 'SEM_HORARIO'], { temHorario: false, weekdays: [], startTime: null, endTime: null })],
      semHorarioCount: 1,
    });
    const html = render(g);
    expect(html).toContain('sem horário');
    expect(html).toContain('não conta essa pessoa como cobertura');
  });

  it('unidade sem gerente nenhum explica o que fazer', () => {
    const html = render(grade({ linhas: [], diasSemGerente: 0 }));
    expect(html).toContain('Nenhum gerente nesta unidade');
  });
});

describe('Quem lançou aparece', () => {
  const g = grade({
    lancamentos: [{
      id: 'l1', userId: 'u-ALESSANDRA', managerName: 'ALESSANDRA', kind: 'FOLGA',
      startDate: '2026-09-02', endDate: '2026-09-02', note: null, lancadoPor: 'Alan',
    }],
  });

  it('a lista do mês diz o período e por quem foi lançado', () => {
    const html = render(g);
    expect(html).toContain('02/09/2026');
    expect(html).toContain('lançado por Alan');
  });

  it('lançamento antigo, sem autor, é nomeado como do próprio gerente', () => {
    const semAutor = grade({ lancamentos: [{ ...g.lancamentos[0], lancadoPor: null }] });
    expect(render(semAutor)).toContain('lançado pelo próprio gerente');
  });
});

describe('Somente leitura', () => {
  /* A regra combinada: quem lança é a Supervisão/Administração. Para o resto do
     sistema esta tela é de consulta — e consulta não mostra botão de gravar. */
  it('sem permissão de editar, não há botão de cadastro nem de apagar', () => {
    const g = grade({
      lancamentos: [{
        id: 'l1', userId: 'u-ALESSANDRA', managerName: 'ALESSANDRA', kind: 'FOLGA',
        startDate: '2026-09-02', endDate: '2026-09-02', note: null, lancadoPor: 'Alan',
      }],
    });
    const html = render(g, false);
    expect(html).not.toContain('Folga / férias<');
    expect(html).not.toContain('Apagar');
    /* Mas a grade e o histórico continuam visíveis. */
    expect(html).toContain('ALESSANDRA');
    expect(html).toContain('lançado por Alan');
  });

  it('com permissão, os dois botões existem', () => {
    const html = render(grade(), true);
    expect(html).toContain('Horário');
    expect(html).toContain('Folga / férias');
  });
});
