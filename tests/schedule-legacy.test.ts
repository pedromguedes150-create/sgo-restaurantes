import { describe, it, expect } from 'vitest';
import { inferirCicloDoLegado, cicloDaMascara, ancoraDo12x36 } from '@/lib/schedule/legacy';
import { plannedStatus } from '@/lib/schedule';
import { planejadoDoDia } from '@/lib/schedule/planned';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/**
 * A tradução das escalas antigas.
 *
 * O critério que importa: para 6x1 e 5x2, o gerador NOVO tem de produzir
 * exatamente o mesmo que o antigo — senão a migração mudaria escalas que estão
 * certas. Para o 12x36 a mudança é o objetivo.
 */

/** Compara os dois geradores dia a dia. */
function mesmoResultadoEm(
  scheduleType: 'SIX_ONE' | 'FIVE_TWO' | 'CUSTOM',
  customMask: string | null,
  anchor: Date,
  dias: number,
): boolean {
  const inf = inferirCicloDoLegado(scheduleType, customMask, anchor)!;
  for (let i = 0; i < dias; i++) {
    const data = new Date(anchor.getTime() + i * 86400000);
    const antigo = plannedStatus({ scheduleType, anchorDate: anchor, customMask }, data);
    const novo = planejadoDoDia(
      {
        workDays: inf.workDays, offDays: inf.offDays,
        anchorDate: anchor, startDate: anchor,
        weeklyOffDay: inf.weeklyOffDay, offMode: 'FIXED_WEEKLY', sundayEveryWeeks: null,
      },
      data,
    );
    if (antigo !== novo) return false;
  }
  return true;
}

describe('cicloDaMascara', () => {
  it('TTTTTFF vira 5x2', () => {
    expect(cicloDaMascara('TTTTTFF')).toEqual({ workDays: 5, offDays: 2 });
  });

  it('máscara ALTERNADA não é traduzida', () => {
    /* "TFTFTFF" não é "trabalha X, folga Y" — traduzir com o mesmo número de
       dias produziria uma escala diferente da que a pessoa cumpre. */
    expect(cicloDaMascara('TFTFTFF')).toBeNull();
  });

  it('máscara sem folga não é ciclo', () => {
    expect(cicloDaMascara('TTTTTTT')).toBeNull();
  });

  it('máscara vazia ou com lixo não estoura', () => {
    expect(cicloDaMascara('')).toBeNull();
    expect(cicloDaMascara('xyz')).toBeNull();
  });
});

describe('6x1 e 5x2: a tradução NÃO muda a grade', () => {
  it('6x1 dá o mesmo resultado por 8 semanas, para qualquer âncora', () => {
    for (let deslocamento = 0; deslocamento < 7; deslocamento++) {
      const anchor = new Date(d('2026-05-04').getTime() + deslocamento * 86400000);
      expect(mesmoResultadoEm('SIX_ONE', null, anchor, 56)).toBe(true);
    }
  });

  it('5x2 também, incluindo a folga que atravessa o fim de semana', () => {
    for (let deslocamento = 0; deslocamento < 7; deslocamento++) {
      const anchor = new Date(d('2026-05-04').getTime() + deslocamento * 86400000);
      expect(mesmoResultadoEm('FIVE_TWO', null, anchor, 56)).toBe(true);
    }
  });

  it('CUSTOM contíguo de 7 dias também', () => {
    expect(mesmoResultadoEm('CUSTOM', 'TTTTTFF', d('2026-05-04'), 56)).toBe(true);
  });

  it('a inferência marca essas escalas como "mesmo resultado"', () => {
    expect(inferirCicloDoLegado('SIX_ONE', null, d('2026-05-04'))!.mesmoResultado).toBe(true);
    expect(inferirCicloDoLegado('FIVE_TWO', null, d('2026-05-04'))!.mesmoResultado).toBe(true);
  });

  it('máscara alternada não é traduzida — fica como está', () => {
    expect(inferirCicloDoLegado('CUSTOM', 'TFTFTFF', d('2026-05-04'))).toBeNull();
  });
});

describe('12x36: a mudança é o objetivo', () => {
  it('vira 1x1 e é marcado como resultado diferente', () => {
    const inf = inferirCicloDoLegado('TWELVE36_ODD', null, d('2026-08-01'))!;
    expect(inf).toMatchObject({ workDays: 1, offDays: 1, weeklyOffDay: null, mesmoResultado: false });
  });

  it('a âncora mantém o dia de trabalho de quem já trabalharia', () => {
    /* Sem isso a escala inverteria na migração: quem trabalharia amanhã
       passaria a folgar, e a troca de turno da unidade iria junto. */
    const corte = d('2026-09-01'); // dia 1, ímpar
    const ancora = ancoraDo12x36('TWELVE36_ODD', corte);
    expect(ancora.toISOString().slice(0, 10)).toBe('2026-09-01');

    const par = ancoraDo12x36('TWELVE36_EVEN', corte);
    expect(par.toISOString().slice(0, 10)).toBe('2026-09-02');
  });

  it('no dia do corte, novo e antigo concordam', () => {
    for (const corte of ['2026-09-01', '2026-09-02', '2026-08-31']) {
      for (const tipo of ['TWELVE36_ODD', 'TWELVE36_EVEN'] as const) {
        const ancora = ancoraDo12x36(tipo, d(corte));
        const antigo = plannedStatus({ scheduleType: tipo, anchorDate: ancora, customMask: null }, d(corte));
        const novo = planejadoDoDia(
          { workDays: 1, offDays: 1, anchorDate: ancora, startDate: d(corte), weeklyOffDay: null, offMode: 'CYCLE_ONLY', sundayEveryWeeks: null },
          d(corte),
        );
        expect(novo).toBe(antigo);
      }
    }
  });

  it('e a partir dali NÃO repete trabalho na virada de mês', () => {
    const ancora = ancoraDo12x36('TWELVE36_ODD', d('2026-08-20'));
    let seq = '';
    for (let i = 0; i < 30; i++) {
      const data = new Date(d('2026-08-20').getTime() + i * 86400000);
      seq += planejadoDoDia(
        { workDays: 1, offDays: 1, anchorDate: ancora, startDate: d('2026-08-20'), weeklyOffDay: null, offMode: 'CYCLE_ONLY', sundayEveryWeeks: null },
        data,
      ) === 'WORK' ? 'T' : 'F';
    }
    expect(seq).not.toContain('TT');
    expect(seq).not.toContain('FF');
  });
});
