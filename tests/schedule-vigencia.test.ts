import { describe, it, expect } from 'vitest';
import { vigenciaNaData, ancoraParaFolgaFixa, diaAnterior, soData, DIAS_DA_SEMANA, diaDeFolgaNaSemana, semanaDoMes } from '@/lib/schedule/vigencia';

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

  it('fixa + domingo: a cada N semanas DO MÊS a folga vai para o domingo', () => {
    /* "Folga fixa na terça" sem isso significaria nunca folgar num domingo.
       A conta é por semana do MÊS e recomeça todo dia 1º (mudou na v1.69.0:
       antes corria desde o início da vigência, sem parar, e o domingo ia
       andando pelo calendário). */
    const dias: number[] = [];
    for (let semana = 0; semana < 8; semana++) {
      const data = new Date(soData(inicio) + semana * 7 * 86400000);
      dias.push(diaDeFolgaNaSemana('FIXED_PLUS_SUNDAY', 2, inicio, data, 4));
    }
    /* 03/05 = 1ª semana de maio → domingo. 31/05 = 5ª → domingo. 07/06 = 1ª de
       junho → domingo de novo: dois domingos seguidos na virada do mês é
       consequência de recomeçar a conta, não defeito. */
    expect(dias).toEqual([0, 2, 2, 2, 0, 0, 2, 2]);
  });

  it('a conta recomeça em todo mês — a mesma semana dá o mesmo resultado', () => {
    /* É o que permite dizer à equipe "você folga no domingo da 1ª semana",
       em vez de "depende de quando sua escala foi cadastrada". */
    for (const primeiroDomingo of ['2026-05-03', '2026-06-07', '2026-07-05', '2026-08-02']) {
      expect(diaDeFolgaNaSemana('FIXED_PLUS_SUNDAY', 2, inicio, d(primeiroDomingo), 4)).toBe(0);
    }
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

describe('A semana do mês é a régua do domingo', () => {
  /* Este bloco existe por causa de um defeito que a primeira versão da mudança
     introduziu: contando pelo DIA do mês (1–7, 8–14…), uma semana do calendário
     atravessava a fronteira dos blocos e podia ficar SEM FOLGA NENHUMA — o
     domingo não folgava porque o bloco dele não era o do ciclo, e a terça
     também não porque o bloco dela mandava folgar no domingo. */

  it('todos os dias da mesma semana recebem a mesma decisão', () => {
    const inicio = d('2026-05-03');
    for (const [domingo, dias] of [['2026-05-31', ['2026-06-01', '2026-06-02', '2026-06-03']]] as const) {
      const doDomingo = diaDeFolgaNaSemana('FIXED_PLUS_SUNDAY', 2, inicio, d(domingo), 2);
      for (const dia of dias) {
        expect(diaDeFolgaNaSemana('FIXED_PLUS_SUNDAY', 2, inicio, d(dia), 2), `${dia} deveria seguir ${domingo}`).toBe(doDomingo);
      }
    }
  });

  it('a semana do mês vem do domingo que a abre', () => {
    expect(semanaDoMes(d('2026-05-03'))).toBe(0); // domingo, dia 3 → 1ª semana
    expect(semanaDoMes(d('2026-05-09'))).toBe(0); // sábado da mesma semana
    expect(semanaDoMes(d('2026-05-10'))).toBe(1); // domingo seguinte → 2ª
    expect(semanaDoMes(d('2026-05-31'))).toBe(4); // domingo, dia 31 → 5ª
  });

  it('nenhuma semana fica sem folga, em nenhum N, em 12 meses', () => {
    /* A varredura que prova a promessa: uma folga por semana, sempre. */
    for (const n of [1, 2, 3, 4, 5]) {
      for (let semana = 0; semana < 53; semana++) {
        const domingo = new Date(soData(d('2026-01-04')) + semana * 7 * 86400000);
        const decisoes = new Set<number>();
        for (let i = 0; i < 7; i++) {
          const dia = new Date(domingo.getTime() + i * 86400000);
          decisoes.add(diaDeFolgaNaSemana('FIXED_PLUS_SUNDAY', 2, d('2026-01-01'), dia, n));
        }
        expect(decisoes.size, `N=${n}, semana de ${domingo.toISOString().slice(0, 10)}: a semana teve mais de uma decisão`).toBe(1);
      }
    }
  });
});
