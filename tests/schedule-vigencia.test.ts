import { describe, it, expect } from 'vitest';
import { vigenciaNaData, ancoraParaFolgaFixa, diaAnterior, soData, DIAS_DA_SEMANA, diaDeFolgaNaSemana } from '@/lib/schedule/vigencia';

/** Data em UTC, sem hora — como o cadastro guarda. */
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('vigenciaNaData', () => {
  const versoes = [
    { id: 'v1', startDate: d('2026-01-01'), endDate: d('2026-04-30') },
    { id: 'v2', startDate: d('2026-05-01'), endDate: null },
  ];

  it('cada dia pega a versão que valia NELE', () => {
    /* É isso que impede mudar a folga hoje e reescrever o Planejado de março. */
    expect(vigenciaNaData(versoes, d('2026-03-15'))?.id).toBe('v1');
    expect(vigenciaNaData(versoes, d('2026-06-15'))?.id).toBe('v2');
  });

  it('as bordas pertencem a quem as declara', () => {
    expect(vigenciaNaData(versoes, d('2026-04-30'))?.id).toBe('v1');
    expect(vigenciaNaData(versoes, d('2026-05-01'))?.id).toBe('v2');
  });

  it('antes da primeira vigência, não há escala — e não se inventa uma', () => {
    /* Inventar faria a grade afirmar folgas e trabalhos que ninguém combinou. */
    expect(vigenciaNaData(versoes, d('2025-12-31'))).toBeNull();
  });

  it('sem versão nenhuma, devolve nulo em vez de estourar', () => {
    expect(vigenciaNaData([], d('2026-01-01'))).toBeNull();
  });

  it('versões sobrepostas: vale a que começou por último', () => {
    /* Acontece com dado antigo ou importação. A decisão mais recente sobre
       aquele dia é a que deve valer. */
    const bagunca = [
      { id: 'antiga', startDate: d('2026-01-01'), endDate: null },
      { id: 'nova', startDate: d('2026-03-01'), endDate: null },
    ];
    expect(vigenciaNaData(bagunca, d('2026-06-01'))?.id).toBe('nova');
  });

  it('a hora do dia não muda a resposta', () => {
    /* A vigência é por DIA; um horário no meio da tarde não pode jogar o dia
       para a versão anterior. */
    const tarde = new Date('2026-05-01T18:30:00.000Z');
    expect(vigenciaNaData(versoes, tarde)?.id).toBe('v2');
  });
});

describe('ancoraParaFolgaFixa', () => {
  /* O gerador conta a posição no ciclo desde a âncora: 0..workDays-1 trabalha,
     o resto folga. Logo o primeiro dia de folga é âncora + workDays. */
  const primeiraFolga = (ancora: Date, workDays: number) => {
    const x = new Date(soData(ancora));
    x.setUTCDate(x.getUTCDate() + workDays);
    return x;
  };

  it('6x1 com folga no domingo: a folga cai no domingo', () => {
    const ancora = ancoraParaFolgaFixa(0, 6, d('2026-05-02'));
    expect(primeiraFolga(ancora, 6).getUTCDay()).toBe(0);
  });

  it('funciona para todos os dias da semana', () => {
    for (let dia = 0; dia < 7; dia++) {
      const ancora = ancoraParaFolgaFixa(dia, 6, d('2026-05-02'));
      expect(primeiraFolga(ancora, 6).getUTCDay()).toBe(dia);
    }
  });

  it('5x2 com folga começando no sábado', () => {
    const ancora = ancoraParaFolgaFixa(6, 5, d('2026-05-02'));
    expect(primeiraFolga(ancora, 5).getUTCDay()).toBe(6);
  });

  it('a âncora nunca é DEPOIS da data de início da vigência', () => {
    /* Se fosse, os primeiros dias da vigência ficariam sem posição no ciclo. */
    for (let dia = 0; dia < 7; dia++) {
      const inicio = d('2026-05-02');
      const ancora = ancoraParaFolgaFixa(dia, 6, inicio);
      expect(soData(ancora)).toBeLessThanOrEqual(soData(inicio));
      /* E nunca mais de uma semana antes — senão a vigência começaria no meio
         de um ciclo antigo sem necessidade. */
      expect(soData(inicio) - soData(ancora)).toBeLessThan(7 * 86400000);
    }
  });

  it('dia da semana fora da faixa não quebra a conta', () => {
    expect(() => ancoraParaFolgaFixa(9, 6, d('2026-05-02'))).not.toThrow();
    expect(() => ancoraParaFolgaFixa(-3, 6, d('2026-05-02'))).not.toThrow();
  });
});

describe('diaAnterior', () => {
  it('fecha a vigência antiga na véspera da nova', () => {
    /* Fechar no mesmo dia deixaria as duas valendo ao mesmo tempo. */
    expect(diaAnterior(d('2026-05-01')).toISOString().slice(0, 10)).toBe('2026-04-30');
  });

  it('atravessa a virada de mês e de ano', () => {
    expect(diaAnterior(d('2026-03-01')).toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(diaAnterior(d('2026-01-01')).toISOString().slice(0, 10)).toBe('2025-12-31');
  });
});

describe('DIAS_DA_SEMANA', () => {
  it('a ordem casa com getUTCDay (0 = domingo)', () => {
    expect(DIAS_DA_SEMANA[0]).toBe('Domingo');
    expect(DIAS_DA_SEMANA[6]).toBe('Sábado');
    expect(DIAS_DA_SEMANA).toHaveLength(7);
  });
});

describe('diaDeFolgaNaSemana — os modos do cadastro', () => {
  const inicio = d('2026-05-03'); // um domingo

  it('folga fixa semanal: o dia nunca muda', () => {
    for (let semana = 0; semana < 10; semana++) {
      const data = new Date(soData(inicio) + semana * 7 * 86400000);
      expect(diaDeFolgaNaSemana('FIXED_WEEKLY', 2, inicio, data)).toBe(2);
    }
  });

  it('folga somente em ciclo também não usa dia fixo variável', () => {
    expect(diaDeFolgaNaSemana('CYCLE_ONLY', 2, inicio, d('2026-07-01'))).toBe(2);
  });

  it('fixa + domingo: a cada N semanas a folga vai para o domingo', () => {
    /* "Folga fixa na terça" sem isso significaria nunca folgar num domingo. */
    const dias: number[] = [];
    for (let semana = 0; semana < 8; semana++) {
      const data = new Date(soData(inicio) + semana * 7 * 86400000);
      dias.push(diaDeFolgaNaSemana('FIXED_PLUS_SUNDAY', 2, inicio, data, 4));
    }
    expect(dias).toEqual([0, 2, 2, 2, 0, 2, 2, 2]);
  });

  it('a primeira semana já é a do domingo', () => {
    /* Começar com N semanas de espera adiaria a promessa logo quando ela foi
       cadastrada — e o gerente não veria o efeito do que acabou de configurar. */
    expect(diaDeFolgaNaSemana('FIXED_PLUS_SUNDAY', 3, inicio, inicio, 7)).toBe(0);
  });

  it('dias no meio da semana caem na mesma decisão da semana', () => {
    const quarta = d('2026-05-06'); // mesma semana do início
    expect(diaDeFolgaNaSemana('FIXED_PLUS_SUNDAY', 2, inicio, quarta, 4)).toBe(0);
  });

  it('N inválido não trava a conta', () => {
    /* Zero faria divisão por zero e NaN espalharia pela grade inteira. */
    expect(() => diaDeFolgaNaSemana('FIXED_PLUS_SUNDAY', 2, inicio, d('2026-06-01'), 0)).not.toThrow();
    expect(Number.isNaN(diaDeFolgaNaSemana('FIXED_PLUS_SUNDAY', 2, inicio, d('2026-06-01'), 0))).toBe(false);
  });
});
