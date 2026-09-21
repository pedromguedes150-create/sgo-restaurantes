import { describe, it, expect } from 'vitest';
import {
  emMinutos, emHHMM, rotuloDaFaixa, faixaCobre, necessidadeNoMinuto,
  statusDaCobertura, conflitoDeFaixa, faixaValida, segmentosDoDia, ehDiaInteiro,
  type FaixaDeNecessidade,
} from '@/lib/workforce/necessidade';

/**
 * NECESSIDADE POR HORÁRIO.
 *
 * O que havia antes era um número só por setor, descrito no schema como "meta
 * de pessoas POR TURNO" — a exigência crescia com a quantidade de turnos
 * cadastrados, sem ninguém ter pedido isso.
 *
 * Aqui se protegem os dois cantos onde essa conta erra calada: a faixa que
 * **cruza a meia-noite** e a **sobreposição** entre faixas (que tornaria a
 * necessidade ambígua sem nada aparecer na tela).
 */

const faixa = (startTime: string, endTime: string, minPeople: number): FaixaDeNecessidade => ({ startTime, endTime, minPeople });
const h = (hh: number, mm = 0) => hh * 60 + mm;

/* O exemplo do pedido: unidade 24 horas. */
const COZINHA_24H = [
  faixa('06:00', '14:00', 3),
  faixa('14:00', '22:00', 2),
  faixa('22:00', '06:00', 1),
];

describe('Ler e escrever horário', () => {
  it('converte nos dois sentidos', () => {
    expect(emMinutos('06:00')).toBe(360);
    expect(emMinutos('14:30')).toBe(870);
    expect(emHHMM(870)).toBe('14:30');
  });

  it('aceita 24:00 como fim do dia — é como as pessoas escrevem', () => {
    expect(emMinutos('24:00')).toBe(0);
    expect(emMinutos('24:30')).toBeNull();
  });

  it('recusa o que não é horário', () => {
    for (const x of ['25:00', '12:60', 'abc', '', null, undefined]) {
      expect(emMinutos(x as string), String(x)).toBeNull();
    }
  });
});

describe('A faixa que CRUZA A MEIA-NOITE', () => {
  const madrugada = faixa('22:00', '06:00', 1);

  it('vale das 22:00 até 05:59 — não é horário inválido', () => {
    expect(faixaCobre(madrugada, h(22))).toBe(true);
    expect(faixaCobre(madrugada, h(23, 59))).toBe(true);
    expect(faixaCobre(madrugada, h(0))).toBe(true);
    expect(faixaCobre(madrugada, h(2))).toBe(true);
    expect(faixaCobre(madrugada, h(5, 59))).toBe(true);
  });

  it('e NÃO vale no meio do dia', () => {
    for (const m of [h(6), h(10), h(14), h(21, 59)]) {
      expect(faixaCobre(madrugada, m), emHHMM(m)).toBe(false);
    }
  });
});

describe('Os limites da faixa', () => {
  const manha = faixa('06:00', '14:00', 3);

  it('inclui o início e EXCLUI o fim — senão 14:00 pertenceria a duas faixas', () => {
    expect(faixaCobre(manha, h(6))).toBe(true);
    expect(faixaCobre(manha, h(13, 59))).toBe(true);
    expect(faixaCobre(manha, h(14))).toBe(false);
  });

  it('início igual ao fim é o dia inteiro — é como a migração guarda o mínimo antigo', () => {
    const diaTodo = faixa('00:00', '00:00', 2);
    for (const m of [0, h(3), h(12), h(23, 59)]) expect(faixaCobre(diaTodo, m), emHHMM(m)).toBe(true);
    expect(rotuloDaFaixa(diaTodo)).toBe('00:00–24:00');
  });
});

describe('A necessidade no horário', () => {
  it('responde o mínimo da faixa que cobre aquele minuto', () => {
    expect(necessidadeNoMinuto(COZINHA_24H, h(9))).toBe(3);
    expect(necessidadeNoMinuto(COZINHA_24H, h(16))).toBe(2);
    expect(necessidadeNoMinuto(COZINHA_24H, h(2))).toBe(1);
    expect(necessidadeNoMinuto(COZINHA_24H, h(10, 30))).toBe(3); // o exemplo do pedido
  });

  it('fora de qualquer faixa a necessidade é ZERO — a unidade não opera ali', () => {
    /* O caso "Pratos 11:00–23:00": às 4h não existe exigência, e alertar seria
       cobrar por algo que ninguém combinou. */
    const pratos = [faixa('11:00', '23:00', 1)];
    expect(necessidadeNoMinuto(pratos, h(4))).toBe(0);
    expect(necessidadeNoMinuto(pratos, h(23, 30))).toBe(0);
    expect(necessidadeNoMinuto(pratos, h(12))).toBe(1);
  });

  it('setor sem faixa nenhuma não exige nada', () => {
    expect(necessidadeNoMinuto([], h(12))).toBe(0);
  });
});

describe('O status', () => {
  it('segue a tabela do pedido', () => {
    expect(statusDaCobertura(3, 3)).toBe('COBERTO');
    expect(statusDaCobertura(3, 4)).toBe('COBERTO');   // excedente continua coberto
    expect(statusDaCobertura(3, 2)).toBe('PARCIAL');
    expect(statusDaCobertura(3, 0)).toBe('SEM_COBERTURA');
  });

  it('necessidade zero é SEM EXIGÊNCIA, nunca um problema', () => {
    expect(statusDaCobertura(0, 0)).toBe('SEM_EXIGENCIA');
    expect(statusDaCobertura(0, 5)).toBe('SEM_EXIGENCIA');
  });
});

describe('Sobreposição entre faixas', () => {
  it('acusa o conflito do exemplo: 13:00–18:00 sobre 06:00–14:00', () => {
    const c = conflitoDeFaixa(COZINHA_24H, faixa('13:00', '18:00', 2));
    expect(c).not.toBeNull();
    expect(c?.faixa.startTime).toBe('06:00');
  });

  it('faixa que encosta sem invadir é aceita — 14:00 é fim de uma e início da outra', () => {
    expect(conflitoDeFaixa([faixa('06:00', '14:00', 3)], faixa('14:00', '22:00', 2))).toBeNull();
  });

  it('pega o conflito de quem CRUZA a meia-noite', () => {
    /* O erro clássico: 22:00–06:00 e 02:00–04:00 não se tocam em aritmética
       ingênua de "início < fim", mas se sobrepõem de verdade. */
    expect(conflitoDeFaixa([faixa('22:00', '06:00', 1)], faixa('02:00', '04:00', 2))).not.toBeNull();
    expect(conflitoDeFaixa([faixa('22:00', '06:00', 1)], faixa('08:00', '10:00', 2))).toBeNull();
  });

  it('a faixa do dia inteiro conflita com qualquer outra', () => {
    expect(conflitoDeFaixa([faixa('00:00', '00:00', 1)], faixa('10:00', '11:00', 2))).not.toBeNull();
  });

  it('ao EDITAR, a faixa não conflita consigo mesma', () => {
    expect(conflitoDeFaixa(COZINHA_24H, faixa('06:00', '14:00', 5), 0)).toBeNull();
  });
});

describe('Faixa válida', () => {
  it('recusa horário inválido e quantidade negativa', () => {
    expect(faixaValida(faixa('25:00', '10:00', 1)).ok).toBe(false);
    expect(faixaValida(faixa('06:00', 'xx', 1)).ok).toBe(false);
    expect(faixaValida(faixa('06:00', '10:00', -1)).ok).toBe(false);
  });

  it('aceita a que cruza a meia-noite e a de mínimo zero', () => {
    expect(faixaValida(faixa('22:00', '06:00', 1)).ok).toBe(true);
    expect(faixaValida(faixa('06:00', '10:00', 0)).ok).toBe(true);
  });
});

describe('A visão do dia', () => {
  it('parte o dia nos trechos em que a exigência não muda', () => {
    const s = segmentosDoDia(COZINHA_24H);
    expect(s.map((x) => `${x.rotulo}=${x.necessario}`)).toEqual([
      '00:00–06:00=1',
      '06:00–14:00=3',
      '14:00–22:00=2',
      '22:00–24:00=1',
    ]);
  });

  it('mostra o trecho SEM exigência como zero, em vez de escondê-lo', () => {
    /* Esconder viraria um buraco no dia, e o gestor leria como se a faixa
       anterior continuasse valendo. */
    const s = segmentosDoDia([faixa('11:00', '23:00', 1)]);
    expect(s.map((x) => `${x.rotulo}=${x.necessario}`)).toEqual([
      '00:00–11:00=0',
      '11:00–23:00=1',
      '23:00–24:00=0',
    ]);
  });

  it('funde trechos vizinhos de mesma necessidade — cadastro não é a mesma coisa que leitura', () => {
    const s = segmentosDoDia([faixa('06:00', '08:00', 3), faixa('08:00', '14:00', 3)]);
    expect(s.map((x) => `${x.rotulo}=${x.necessario}`)).toEqual([
      '00:00–06:00=0',
      '06:00–14:00=3',
      '14:00–24:00=0',
    ]);
  });

  it('setor sem faixa nenhuma é um único trecho de zero', () => {
    expect(segmentosDoDia([])).toEqual([
      { inicio: 0, fim: 1440, rotulo: '00:00–24:00', necessario: 0 },
    ]);
  });
});

/**
 * O CENÁRIO RELATADO: unidade 24 horas, funções com horários próprios.
 *
 * O horário de funcionamento da UNIDADE não define a necessidade da FUNÇÃO —
 * era isso que a faixa 00:00–24:00 herdada da migração fazia parecer.
 */
describe('Unidade 24 horas não significa função 24 horas', () => {
  /* Auxiliar de Cozinha do pedido: dois turnos que se encostam. */
  const AUX_COZINHA = [faixa('06:40', '15:00', 1), faixa('15:00', '23:40', 1)];

  it('as duas faixas convivem — encostar não é sobrepor', () => {
    expect(conflitoDeFaixa([AUX_COZINHA[0]], AUX_COZINHA[1])).toBeNull();
  });

  it('exige 1 pessoa dentro dos dois turnos', () => {
    for (const minuto of [h(7), h(14), h(16), h(22)]) {
      expect(necessidadeNoMinuto(AUX_COZINHA, minuto)).toBe(1);
    }
  });

  it('às 00:30 NÃO há exigência — e isso não é "sem cobertura"', () => {
    expect(necessidadeNoMinuto(AUX_COZINHA, h(0, 30))).toBe(0);
    expect(statusDaCobertura(0, 0)).toBe('SEM_EXIGENCIA');
    /* O ponto do pedido: não pode sair "0/1 — sem cobertura" às 2h num setor
       que nem opera àquela hora. */
    expect(statusDaCobertura(0, 0)).not.toBe('SEM_COBERTURA');
  });

  it('o minuto exato da virada pertence à faixa que começa', () => {
    /* 15:00 é fim da primeira e início da segunda. Sem isto, 15:00 ficaria sem
       dono — um buraco de um minuto que ninguém veria. */
    expect(faixaCobre(AUX_COZINHA[0], h(15))).toBe(false);
    expect(faixaCobre(AUX_COZINHA[1], h(15))).toBe(true);
    expect(necessidadeNoMinuto(AUX_COZINHA, h(15))).toBe(1);
  });

  it('a churrasqueira com buraco entre os serviços não cobra ninguém às 16h', () => {
    const CHURRASQUEIRA = [faixa('10:00', '15:00', 2), faixa('18:00', '23:00', 2)];
    expect(necessidadeNoMinuto(CHURRASQUEIRA, h(12))).toBe(2);
    expect(necessidadeNoMinuto(CHURRASQUEIRA, h(16))).toBe(0);
    expect(necessidadeNoMinuto(CHURRASQUEIRA, h(20))).toBe(2);
  });

  it('o Caixa 24 horas continua exigindo em qualquer minuto', () => {
    const CAIXA = [faixa('00:00', '24:00', 1)];
    for (const minuto of [0, h(2), h(12), h(23, 59)]) {
      expect(necessidadeNoMinuto(CAIXA, minuto)).toBe(1);
    }
  });

  it('a faixa de dia inteiro é reconhecida como tal — é o que a caixa de marcar lê', () => {
    expect(ehDiaInteiro(faixa('00:00', '24:00', 1))).toBe(true);
    expect(ehDiaInteiro(faixa('00:00', '00:00', 1))).toBe(true);
    expect(ehDiaInteiro(faixa('06:40', '15:00', 1))).toBe(false);
    expect(ehDiaInteiro(faixa('22:00', '06:00', 1))).toBe(false);
  });
});
