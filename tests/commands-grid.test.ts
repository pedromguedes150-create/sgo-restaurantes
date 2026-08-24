import { describe, it, expect } from 'vitest';
import { ausentesDaGrade, escopoDaConferencia, conferiveisDaGrade, conferidasDaUltimaContagem } from '@/lib/commands/grid';

describe('ausentesDaGrade', () => {
  const conferiveis = [1, 2, 3, 4, 5];

  it('faltante é o que não foi marcado', () => {
    expect(ausentesDaGrade(conferiveis, [1, 2, 3], [])).toEqual([4, 5]);
  });

  it('EM USO conta como presente (é o que a legenda da tela promete)', () => {
    expect(ausentesDaGrade(conferiveis, [1, 2, 3], [4, 5])).toEqual([]);
  });

  it('com tudo marcado não sobra falta — o beco sem saída', () => {
    /* O caso que travou a tela em produção: as comandas EM APURAÇÃO ficam fora
       de `conferiveis` (não dá para tocá-las). Quando o julgamento usava a
       sequência inteira, elas contavam como faltantes para sempre: o campo de
       observação sumia junto com o contador zerado, e o botão continuava
       recusando por falta de uma observação impossível de escrever. */
    expect(ausentesDaGrade(conferiveis, conferiveis, [])).toEqual([]);
  });

  it('grade vazia = tudo faltando (não é o mesmo que "tudo presente")', () => {
    expect(ausentesDaGrade(conferiveis, [], [])).toEqual(conferiveis);
  });

  it('marcar número fora do escopo não inventa presença', () => {
    expect(ausentesDaGrade(conferiveis, [1, 2, 99], [])).toEqual([3, 4, 5]);
  });
});

describe('escopoDaConferencia', () => {
  const ate = (n: number, de = 1) => Array.from({ length: n - de + 1 }, (_, i) => de + i);
  const ativas = ate(648);
  const doDia = ate(300);

  it('com faixa do dia, a conferência diária julga só ela', () => {
    const r = escopoDaConferencia(ativas, doDia, 'dia');
    expect(r.temFaixaDoDia).toBe(true);
    expect(r.naFaixaDoDia).toBe(true);
    expect(r.universo).toHaveLength(300);
    expect(r.universo.at(-1)).toBe(300);
  });

  it('a completa julga a sequência inteira', () => {
    const r = escopoDaConferencia(ativas, doDia, 'completa');
    expect(r.naFaixaDoDia).toBe(false);
    expect(r.universo).toHaveLength(648);
  });

  it('sem faixa configurada, nada muda para quem confere tudo todo dia', () => {
    const r = escopoDaConferencia(ativas, [], 'dia');
    expect(r.temFaixaDoDia).toBe(false);
    expect(r.universo).toHaveLength(648);
  });

  it('faixa que cobre tudo não é faixa', () => {
    /* Senão a tela ofereceria "faixa do dia (648)" ao lado de "completa (648)". */
    const r = escopoDaConferencia(ativas, ativas, 'dia');
    expect(r.temFaixaDoDia).toBe(false);
  });

  it('na faixa do dia, as guardadas não contam como faltantes', () => {
    /* O defeito relatado: 400+ comandas guardadas caindo como ausentes todo
       dia porque a grade julgava as 648. */
    const { universo } = escopoDaConferencia(ativas, doDia, 'dia');
    const todasMarcadas = new Set(universo);
    expect(ausentesDaGrade(universo, todasMarcadas, [])).toEqual([]);
  });
});

describe('conferiveisDaGrade', () => {
  it('tira em apuração e baixadas do que pode ser marcado', () => {
    expect(conferiveisDaGrade([1, 2, 3, 4, 5], [3], [5])).toEqual([1, 2, 4]);
  });

  it('a grade e o atalho partem da MESMA lista', () => {
    /* Enquanto cada um calculava a sua, o atalho "todas presentes" registrava
       como presentes comandas que a grade nem deixava tocar. */
    const universo = [1, 2, 3, 4, 5];
    const daGrade = conferiveisDaGrade(universo, [3], [5]);
    expect(ausentesDaGrade(daGrade, daGrade, [])).toEqual([]);
    expect(daGrade).not.toContain(3);
  });

  it('sem apuração nem baixada, é o universo inteiro', () => {
    expect(conferiveisDaGrade([1, 2, 3], [], [])).toEqual([1, 2, 3]);
  });
});

describe('conferidasDaUltimaContagem', () => {
  const ativas = [1, 2, 3, 4, 5, 6];
  const escopoDoDia = [1, 2, 3];

  it('"todas presentes" numa PARCIAL vale só para o escopo', () => {
    /* Senão a grade reabria com as guardadas verdes, dizendo que foram
       conferidas quando ninguém as tocou. */
    expect(conferidasDaUltimaContagem(true, escopoDoDia, [], ativas)).toEqual([1, 2, 3]);
  });

  it('"todas presentes" numa COMPLETA vale para a sequência inteira', () => {
    expect(conferidasDaUltimaContagem(true, [], [], ativas)).toEqual(ativas);
  });

  it('contagem normal reabre com o que foi marcado', () => {
    expect(conferidasDaUltimaContagem(false, escopoDoDia, [1, 3], ativas)).toEqual([1, 3]);
  });
});
