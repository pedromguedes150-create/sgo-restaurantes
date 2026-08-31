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
