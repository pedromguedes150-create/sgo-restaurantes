import { describe, it, expect } from 'vitest';
import { vigenciaNaData, ancoraParaFolgaFixa, diaAnterior, soData, DIAS_DA_SEMANA, diaDeFolgaNaSemana, semanaDoMes, ehDomingoDoMes } from '@/lib/schedule/vigencia';

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

  it('fixa + domingo: o dia fixo NÃO muda — o domingo é uma folga a mais', () => {
    /* A regra da rede, dita pelo Alan (04/09): "a folga é toda quinta e o
       colaborador tem direito a 1 domingo no mês". Antes o domingo SUBSTITUÍA
       a folga fixa naquela semana, e a quinta sumia da grade. */
    for (let semana = 0; semana < 8; semana++) {
      const data = new Date(soData(inicio) + semana * 7 * 86400000);
      expect(diaDeFolgaNaSemana('FIXED_PLUS_SUNDAY', 4, inicio, data)).toBe(4); // quinta, sempre
    }
  });
});

describe('ehDomingoDoMes — a folga extra do mês', () => {
  it('acerta o enésimo domingo', () => {
    /* Setembro/2026: domingos em 6, 13, 20 e 27. */
    expect(ehDomingoDoMes(d('2026-09-06'), 1)).toBe(true);
    expect(ehDomingoDoMes(d('2026-09-13'), 2)).toBe(true);
    expect(ehDomingoDoMes(d('2026-09-20'), 3)).toBe(true);
    expect(ehDomingoDoMes(d('2026-09-27'), 4)).toBe(true);
  });

  it('não confunde com os outros domingos do mês', () => {
    for (const dia of ['2026-09-06', '2026-09-13', '2026-09-27']) {
      expect(ehDomingoDoMes(d(dia), 3), dia).toBe(false);
    }
  });

  it('dia que não é domingo nunca conta', () => {
    expect(ehDomingoDoMes(d('2026-09-17'), 3)).toBe(false); // quinta
    expect(ehDomingoDoMes(d('2026-09-21'), 3)).toBe(false); // segunda
  });

  it('mês sem 5º domingo simplesmente não tem a folga extra', () => {
    /* Setembro/2026 tem 4 domingos. Empurrar para o 4º seria inventar um dia
       que ninguém combinou. */
    for (const dia of ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27']) {
      expect(ehDomingoDoMes(d(dia), 5), dia).toBe(false);
    }
    /* Agosto/2026 TEM 5 domingos: 2, 9, 16, 23 e 30. */
    expect(ehDomingoDoMes(d('2026-08-30'), 5)).toBe(true);
  });

  it('sem escolha, não há folga extra', () => {
    expect(ehDomingoDoMes(d('2026-09-06'), null)).toBe(false);
    expect(ehDomingoDoMes(d('2026-09-06'), 0)).toBe(false);
  });
});

describe('A folga fixa não se move — nunca', () => {
  /* Este bloco nasceu de um defeito que a tentativa anterior introduziu: quando
     o domingo SUBSTITUÍA a folga da semana, uma semana do calendário podia
     ficar SEM FOLGA NENHUMA (o domingo caía num bloco e a terça em outro).
     Com o domingo somando em vez de trocar, o risco deixou de existir — e
     estes casos garantem que ele não volte. */

  it('todos os dias da semana veem o MESMO dia fixo de folga', () => {
    const inicio = d('2026-05-03');
    for (const dia of ['2026-05-31', '2026-06-01', '2026-06-02', '2026-06-03']) {
      expect(diaDeFolgaNaSemana('FIXED_PLUS_SUNDAY', 4, inicio, d(dia)), dia).toBe(4);
    }
  });

  it('a semana do mês vem do domingo que a abre', () => {
    expect(semanaDoMes(d('2026-05-03'))).toBe(0); // domingo, dia 3 → 1ª semana
    expect(semanaDoMes(d('2026-05-09'))).toBe(0); // sábado da mesma semana
    expect(semanaDoMes(d('2026-05-10'))).toBe(1); // domingo seguinte → 2ª
    expect(semanaDoMes(d('2026-05-31'))).toBe(4); // domingo, dia 31 → 5ª
  });

  it('em 53 semanas de 2026, a decisão da semana nunca varia dentro dela', () => {
    for (let semana = 0; semana < 53; semana++) {
      const domingo = new Date(soData(d('2026-01-04')) + semana * 7 * 86400000);
      const decisoes = new Set<number>();
      for (let i = 0; i < 7; i++) {
        const dia = new Date(domingo.getTime() + i * 86400000);
        decisoes.add(diaDeFolgaNaSemana('FIXED_PLUS_SUNDAY', 4, d('2026-01-01'), dia));
      }
      expect(decisoes.size, `semana de ${domingo.toISOString().slice(0, 10)}`).toBe(1);
    }
  });
});
