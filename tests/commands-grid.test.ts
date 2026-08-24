import { describe, it, expect } from 'vitest';
import { ausentesDaGrade } from '@/lib/commands/grid';

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
