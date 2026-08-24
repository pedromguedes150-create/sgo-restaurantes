import { describe, it, expect } from 'vitest';
import { ausentesDaGrade, escopoDaConferencia } from '@/lib/commands/grid';

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
