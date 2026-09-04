import { describe, it, expect } from 'vitest';
import { folgaNoDia, planejadoDoDia, type VersaoParaPlanejado } from '@/lib/schedule/planned';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const base = (over: Partial<VersaoParaPlanejado> = {}): VersaoParaPlanejado => ({
  workDays: 6, offDays: 1,
  anchorDate: d('2026-05-04'),
  startDate: d('2026-05-04'),
  weeklyOffDay: 0, // domingo
  offMode: 'FIXED_WEEKLY',
  sundayEveryWeeks: null,
  sundayOfMonth: null,
  ...over,
});

/** Os status de N dias seguidos, a partir de uma data. */
function sequencia(v: VersaoParaPlanejado, inicio: string, dias: number): string {
  const out: string[] = [];
  for (let i = 0; i < dias; i++) {
    const dt = new Date(d(inicio).getTime() + i * 86400000);
    out.push(planejadoDoDia(v, dt) === 'WORK' ? 'T' : 'F');
  }
  return out.join('');
}

describe('6x1 com folga fixa no domingo', () => {
  it('folga cai no domingo, semana após semana', () => {
    const v = base();
    for (let semana = 0; semana < 8; semana++) {
      const domingo = new Date(d('2026-05-10').getTime() + semana * 7 * 86400000);
      expect(domingo.getUTCDay()).toBe(0);
      expect(folgaNoDia(v, domingo)).toBe(true);
    }
  });

  it('a semana sai TTTTTTF começando na segunda', () => {
    /* 2026-05-11 é uma segunda-feira. */
    expect(sequencia(base(), '2026-05-11', 14)).toBe('TTTTTTFTTTTTTF');
  });

  it('folga na terça: nenhum domingo de folga', () => {
    const v = base({ weeklyOffDay: 2 });
    const domingo = d('2026-05-10');
    expect(folgaNoDia(v, domingo)).toBe(false);
    const terca = d('2026-05-12');
    expect(terca.getUTCDay()).toBe(2);
    expect(folgaNoDia(v, terca)).toBe(true);
  });
});

describe('5x2 — duas folgas seguidas', () => {
  it('folga no sábado significa sábado e domingo', () => {
    const v = base({ workDays: 5, offDays: 2, weeklyOffDay: 6 });
    expect(folgaNoDia(v, d('2026-05-09'))).toBe(true); // sábado
    expect(folgaNoDia(v, d('2026-05-10'))).toBe(true); // domingo
    expect(folgaNoDia(v, d('2026-05-11'))).toBe(false); // segunda
  });

  it('a folga dá a volta na semana quando começa no sábado', () => {
    /* Sábado + domingo atravessa o fim da semana: o cálculo precisa dar a
       volta em 7, senão o domingo ficaria de fora. */
    const v = base({ workDays: 5, offDays: 2, weeklyOffDay: 6 });
    expect(sequencia(v, '2026-05-11', 7)).toBe('TTTTTFF');
  });
});

describe('12x36 — o defeito que a parte 3 vem corrigir', () => {
  /* Ciclo 1x1 contado em DIAS CORRIDOS. O sistema antigo usava a paridade do
     dia do mês e dava 31/08 T seguido de 01/09 T — dois trabalhos em sequência
     em toda virada de mês com 31 dias. */
  const v = base({ workDays: 1, offDays: 1, weeklyOffDay: null, anchorDate: d('2026-08-01') });

  it('alterna dia sim, dia não', () => {
    expect(sequencia(v, '2026-08-01', 6)).toBe('TFTFTF');
  });

  it('a virada de mês NÃO repete o trabalho', () => {
    const virada = sequencia(v, '2026-08-29', 6); // 29,30,31/08 e 1,2,3/09
    expect(virada).toBe('TFTFTF');
    /* A prova direta: nenhum "TT" em lugar nenhum de 60 dias. */
    expect(sequencia(v, '2026-08-01', 60)).not.toContain('TT');
  });

  it('atravessa a virada de ano do mesmo jeito', () => {
    expect(sequencia(v, '2026-12-30', 4)).not.toContain('TT');
  });
});

describe('Ciclos que não fecham na semana', () => {
  it('4x2 anda pela semana, como tem de andar', () => {
    const v = base({ workDays: 4, offDays: 2, weeklyOffDay: null, anchorDate: d('2026-05-04') });
    expect(sequencia(v, '2026-05-04', 12)).toBe('TTTTFFTTTTFF');
  });

  it('dia fixo é ignorado quando o ciclo não fecha na semana', () => {
    /* Prometer dia fixo num ciclo de 6 dias seria mentira — a folga anda. */
    const v = base({ workDays: 4, offDays: 2, weeklyOffDay: 0, anchorDate: d('2026-05-04') });
    expect(sequencia(v, '2026-05-04', 6)).toBe('TTTTFF');
  });
});

describe('Folga fixa + 1 domingo no mês', () => {
  /* A regra da rede, dita pelo Alan (04/09): "a folga é toda quinta e o
     colaborador tem direito a 1 domingo no mês — 1º, 2º, 3º, 4º ou 5º".
     São folgas que SE SOMAM. Antes o domingo substituía a folga daquela
     semana, e a quinta sumia da grade: foi esse o relato. */

  /* O caso do print: 6x1, folga toda QUINTA, 3º domingo. Setembro/2026 tem
     quintas em 3, 10, 17 e 24, e domingos em 6, 13, 20 e 27. */
  const alessandra = base({
    weeklyOffDay: 4, offMode: 'FIXED_PLUS_SUNDAY', sundayOfMonth: 3,
    anchorDate: d('2026-08-28'), startDate: d('2026-09-01'),
  });

  it('TODAS as quintas do mês são folga', () => {
    for (const quinta of ['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24']) {
      expect(folgaNoDia(alessandra, d(quinta)), quinta).toBe(true);
    }
  });

  it('e o 3º domingo também', () => {
    expect(folgaNoDia(alessandra, d('2026-09-20'))).toBe(true);
  });

  it('os outros domingos são trabalho', () => {
    for (const domingo of ['2026-09-06', '2026-09-13', '2026-09-27']) {
      expect(folgaNoDia(alessandra, d(domingo)), domingo).toBe(false);
    }
  });

  it('a semana do domingo tem DUAS folgas — é o direito, não um erro', () => {
    /* Semana de 20 a 26/09: domingo 20 (o 3º) e quinta 24. */
    expect(sequencia(alessandra, '2026-09-20', 7)).toBe('FTTTFTT');
  });

  it('o mês inteiro sai como o Alan descreveu', () => {
    /* 1 (Ter) a 30 (Qua) de setembro/2026. */
    expect(sequencia(alessandra, '2026-09-01', 30)).toBe('TTFTTTTTTFTTTTTTFTTFTTTFTTTTTT');
  });

  it('nenhuma semana fica sem folga', () => {
    /* A folga fixa nunca é movida, então a promessa se mantém sozinha. */
    for (let semana = 0; semana < 9; semana++) {
      const inicio = new Date(d('2026-09-06').getTime() + semana * 7 * 86400000);
      const s = sequencia(alessandra, inicio.toISOString().slice(0, 10), 7);
      expect(s).toContain('F');
    }
  });

  it('sem escolher o domingo, é só a folga fixa', () => {
    const v = base({ weeklyOffDay: 4, offMode: 'FIXED_PLUS_SUNDAY', sundayOfMonth: null, anchorDate: d('2026-08-28'), startDate: d('2026-09-01') });
    expect(folgaNoDia(v, d('2026-09-20'))).toBe(false);
    expect(folgaNoDia(v, d('2026-09-17'))).toBe(true);
  });
});

describe('Bordas', () => {
  it('ciclo inválido não estoura', () => {
    const v = base({ workDays: 0, offDays: 0, weeklyOffDay: null });
    expect(() => planejadoDoDia(v, d('2026-05-10'))).not.toThrow();
  });

  it('data anterior à âncora ainda cai no ciclo certo', () => {
    /* O resto negativo do JavaScript daria posição errada sem o "+ciclo". */
    const v = base({ workDays: 1, offDays: 1, weeklyOffDay: null, anchorDate: d('2026-08-10') });
    expect(sequencia(v, '2026-08-06', 4)).toBe('TFTF');
  });
});
