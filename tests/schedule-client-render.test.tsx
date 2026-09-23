import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/escala',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { ScheduleClient } from '@/components/schedule/schedule-client';

type Props = React.ComponentProps<typeof ScheduleClient>;

const linha = (nome: string) => ({
  collaboratorId: `c-${nome}`, name: nome, jobTitle: 'Aux. de Cozinha',
  typeLabel: '6x1 Tarde', scheduleType: 'SIX_ONE' as const, shiftLabel: '14:00–22:17',
  days: Array.from({ length: 31 }, () => ({ planned: 'WORK' as const, actual: null })),
});

function render(over: Partial<Props> = {}) {
  const props = {
    units: [{ id: 'u1', name: 'Jardim Teresópolis' }],
    selectedUnitId: 'u1',
    year: 2026, month: 8,
    grid: { year: 2026, month: 8, daysCount: 31, rows: [linha('ALESSANDRA')], withoutSchedule: [] },
    collaborators: [{ id: 'c1', name: 'ALESSANDRA' }],
    turnos: [],
    patterns: [],
    ...over,
  } as Props;
  /* Tira os marcadores que o SSR do React põe entre pedaços de texto — a
     asserção é sobre a FRASE, não sobre o HTML. */
  return renderToString(React.createElement(ScheduleClient, props)).split('<!-- -->').join('');
}

describe('Escala — o Planejado explica de onde vem', () => {
  const noPlanejado = { grid: { year: 2026, month: 8, daysCount: 31, rows: [linha('ALESSANDRA')], withoutSchedule: [] } };

  it('a aba Realizado não oferece mais "Preencher automaticamente"', () => {
    /* Preencher presença que ninguém conferiu é o sistema AFIRMANDO um fato que
       não aconteceu. O nome também sugeria planejar, e planejar é o que o
       Planejado faz sozinho. */
    const html = render();
    expect(html).not.toContain('Preencher automaticamente');
    expect(html).toContain('Completar dias vazios');
  });

  it('"Puxar Realizado = Planejado" continua disponível', () => {
    expect(render()).toContain('Puxar Realizado = Planejado');
  });

  it('sem ninguém de fora, o Planejado não inventa alarme', () => {
    const html = render(noPlanejado);
    expect(html).not.toContain('fora da grade');
  });
});

describe('Quem está sem escala aparece', () => {
  it('a grade DIZ quem ficou de fora, com os nomes', () => {
    /* Sem escala cadastrada a pessoa simplesmente não aparece na grade — some
       em silêncio, e o gerente descobre no fim do mês. */
    const html = render({
      grid: {
        year: 2026, month: 8, daysCount: 31,
        rows: [linha('ALESSANDRA')],
        withoutSchedule: [{ id: 'x1', name: 'JOAO DA SILVA' }, { id: 'x2', name: 'MARIA SOUZA' }],
      },
    });
    expect(html).toContain('2 colaborador(es) fora da grade');
    expect(html).toContain('JOAO DA SILVA');
    expect(html).toContain('MARIA SOUZA');
    expect(html).toContain('Cadastrar a escala deles');
  });

  it('grade vazia não estoura', () => {
    expect(render({ grid: { year: 2026, month: 8, daysCount: 31, rows: [], withoutSchedule: [] } })).toBeTruthy();
  });
});

describe('Fase 2 — barra de três botões, filtros, quatro blocos e totais', () => {
  const grade = (rows: Props['grid']['rows']) => ({ year: 2026, month: 8, daysCount: 31, rows, withoutSchedule: [] });
  const semSeparadores = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');

  it('as três visões viram um controle segmentado e o botão de filtros aparece', () => {
    const html = render();
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Visão da escala"');
    for (const r of ['Planejado', 'Realizado', 'Comparação']) expect(html).toContain(r);
    expect(html).toContain('Filtros');
  });

  it('os quatro blocos somam a grade — no Realizado, dias sem marcação ficam ditos', () => {
    /* Ana: 31 dias planejados T, realizado só nos 3 primeiros (T, T, FI). */
    const ana: Props['grid']['rows'][number] = {
      ...linha('ANA'),
      days: linha('ANA').days.map((d, i) => (i < 3 ? { planned: 'WORK', actual: i === 2 ? 'FALTA_INJUST' : 'WORK' } : d)),
    };
    const html = semSeparadores(render({ grid: grade([ana]) }));
    for (const b of ['Na grade', 'Dias de trabalho', 'Folgas', 'Ausências']) expect(html).toContain(b);
    expect(html).toContain('28 dia(s) sem marcação');
    expect(html).toContain('FI 1');
  });

  it('cada linha ganha a coluna de totais T · F · Aus', () => {
    const html = render();
    expect(html).toContain('T · F · Aus');
  });

  it('o setor do Mapa de Funções aparece na linha quando existe', () => {
    const ana = { ...linha('ANA'), setores: ['Cozinha'] };
    const html = semSeparadores(render({ grid: grade([ana]) }));
    expect(html).toContain('Cozinha');
  });

  it('grade vazia não desenha os blocos (não há o que somar)', () => {
    const html = render({ grid: grade([]) });
    expect(html).not.toContain('Na grade');
  });
});
