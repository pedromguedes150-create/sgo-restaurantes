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

describe('Folga fixa + domingo em ciclo', () => {
  it('a folga vai para o domingo nas semanas do MÊS e volta ao dia fixo', () => {
    const v = base({ weeklyOffDay: 2, offMode: 'FIXED_PLUS_SUNDAY', sundayEveryWeeks: 2, startDate: d('2026-05-01') });
    /* A cada 2 semanas do mês = 1ª e 3ª. Em maio/2026 as semanas começam nos
       domingos 03, 10, 17, 24 e 31 — então 03/05 (1ª) e 17/05 (3ª) são de
       domingo, e nas outras a folga fica na terça. */
    expect(folgaNoDia(v, d('2026-05-03'))).toBe(true);   // domingo da 1ª semana
    expect(folgaNoDia(v, d('2026-05-17'))).toBe(true);   // domingo da 3ª semana
    expect(folgaNoDia(v, d('2026-05-10'))).toBe(false);  // 2ª semana: folga na terça
    expect(folgaNoDia(v, d('2026-05-12'))).toBe(true);   // ...que é esta
    expect(folgaNoDia(v, d('2026-05-05'))).toBe(false);  // terça da semana do domingo
  });

  it('nenhuma semana fica sem folga', () => {
    /* O risco do modo: trocar o dia sem garantir que a semana teve descanso. */
    const v = base({ weeklyOffDay: 2, offMode: 'FIXED_PLUS_SUNDAY', sundayEveryWeeks: 3, startDate: d('2026-05-10') });
    for (let semana = 0; semana < 9; semana++) {
      const inicio = new Date(d('2026-05-10').getTime() + semana * 7 * 86400000);
      const s = sequencia(v, inicio.toISOString().slice(0, 10), 7);
      expect(s).toContain('F');
    }
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
