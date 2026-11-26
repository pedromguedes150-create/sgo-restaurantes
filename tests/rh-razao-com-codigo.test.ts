import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { semCodigo, temCodigo, variantesComCodigo } from '@/lib/rh/razoes-calculo';

const NU = 'COMERCIAL LINS & GUEDES LTDA (NOVA UNIÃO)';
const DO_RH = [
  NU,
  `675 - ${NU}`,
  'COMERCIAL BEIJA FLOR NOVA UNIÃO LTDA',
  '669 - COMERCIAL LINS & GUEDES LTDA (PRODUTOS)',
  '152 - COMERCIAL LINS E GUEDES LTDA ME',
  '8 - POSTO PALHA SECA LTDA',
  'POSTO NOVA UNIÃO LTDA',
];

describe('razão social do RH com o código na frente (v1.224.1)', () => {
  it('tira só o prefixo "número - " e nada mais', () => {
    expect(semCodigo(`675 - ${NU}`)).toBe(NU);
    expect(semCodigo('8 -POSTO PALHA SECA LTDA')).toBe('POSTO PALHA SECA LTDA');
    expect(semCodigo(NU)).toBe(NU);
    expect(semCodigo('POSTO SANTO ANTONIO DO AMPARO- JOJO')).toBe('POSTO SANTO ANTONIO DO AMPARO- JOJO');
    expect(temCodigo(`675 - ${NU}`)).toBe(true);
    expect(temCodigo(NU)).toBe(false);
    expect(temCodigo('24 HORAS LANCHES')).toBe(false);
  });

  it('a unidade passa a ler a variante com código — o nome do RH, byte a byte', () => {
    expect(variantesComCodigo([NU], DO_RH)).toEqual([`675 - ${NU}`]);
  });

  it('vale para a principal e para as adicionais', () => {
    expect(variantesComCodigo([NU, 'COMERCIAL LINS & GUEDES LTDA (PRODUTOS)'], DO_RH)).toEqual([`675 - ${NU}`, '669 - COMERCIAL LINS & GUEDES LTDA (PRODUTOS)']);
  });

  it('não é aproximação: "E" no lugar de "&", caixa ou acento diferente não casam', () => {
    expect(variantesComCodigo(['COMERCIAL LINS & GUEDES LTDA ME'], DO_RH)).toEqual([]);
    expect(variantesComCodigo([NU.toLowerCase()], DO_RH)).toEqual([]);
    expect(variantesComCodigo(['COMERCIAL LINS & GUEDES LTDA (NOVA UNIAO)'], DO_RH)).toEqual([]);
    expect(variantesComCodigo(['POSTO NOVA UNIÃO LTDA'], DO_RH)).toEqual([]);
  });

  it('o que já foi ligado à mão não se repete, e o que é de OUTRA unidade nunca é puxado', () => {
    expect(variantesComCodigo([NU, `675 - ${NU}`], DO_RH)).toEqual([]);
    expect(variantesComCodigo([NU], DO_RH, [`675 - ${NU}`])).toEqual([]);
  });

  it('lista do RH vazia ou com lixo não quebra', () => {
    expect(variantesComCodigo([NU], [])).toEqual([]);
    expect(variantesComCodigo([], DO_RH)).toEqual([]);
    expect(variantesComCodigo([NU], [null as unknown as string, `675 - ${NU}`, `675 - ${NU}`])).toEqual([`675 - ${NU}`]);
  });

  it('sync, diagnóstico e webhook leem pela mesma função; falha do RH devolve só o configurado', () => {
    const fonte = readFileSync('src/lib/rh/razoes.ts', 'utf8');
    expect(fonte).toContain('return [...configurados, ...(await variantesComCodigoDaUnidade(unit, configurados))];');
    expect(fonte).toMatch(/catch \{\s*return \[\];\s*\}/);
    expect(fonte).toContain('unidadeDaRazaoSocial(base)');
    expect(readFileSync('src/lib/rh/sync.ts', 'utf8')).toContain('await nomesNoRhDaUnidade(unit)');
    expect(readFileSync('src/lib/rh/diagnostico.ts', 'utf8')).toContain('await nomesNoRhDaUnidade(unit)');
  });
});
