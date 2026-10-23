import { describe, it, expect } from 'vitest';
import { chaveFonetica, resolverVinculoPorNome, semelhancaDeNomes, semelhancaDePalavras, sugestoesPorSemelhanca, SEMELHANCA_MINIMA } from '@/lib/comissao/calculo';

/** Comparação inteligente de nomes Teknisa × RH (v1.178.0) — só SUGERE; quem confirma é a pessoa. */

describe('som da palavra', () => {
  it('z/s, ss, y/i, h mudo, th, ph e letra dobrada viram a mesma chave', () => {
    expect(chaveFonetica('Souza')).toBe(chaveFonetica('Sousa'));
    expect(chaveFonetica('Thiago')).toBe(chaveFonetica('Tiago'));
    expect(chaveFonetica('Heitor')).toBe(chaveFonetica('Eitor'));
    expect(chaveFonetica('Krissley')).toBe(chaveFonetica('Krisley'));
    expect(chaveFonetica('Luiz')).toBe(chaveFonetica('Luis'));
  });
  it('mesmo som vale 0,95 (não 1): grafia diferente nunca passa por idêntica', () => {
    expect(semelhancaDePalavras('Souza', 'souza')).toBe(1);
    expect(semelhancaDePalavras('Souza', 'Sousa')).toBe(0.95);
    expect(semelhancaDePalavras('Ana', 'Maria')).toBeLessThan(0.5);
  });
});

describe('percentual entre nomes', () => {
  it('os casos do print do Pedro sobem acima da linha de sugestão', () => {
    expect(semelhancaDeNomes('Janaina Souza', 'Janaina Sousa Coelho')).toBeGreaterThanOrEqual(95);
    expect(semelhancaDeNomes('Krissley Helbert', 'Krissley Hubert Ribeiro Carvalho')).toBeGreaterThanOrEqual(SEMELHANCA_MINIMA);
    expect(semelhancaDeNomes('Emily Julie', 'Emily Julie Silva Mota')).toBe(100);
    expect(semelhancaDeNomes('Maria Merces', 'Maria das Mercês Santos')).toBe(100);
  });
  it('primeiro nome diferente derruba — "Ana Souza" não é "Maria Souza"', () => {
    expect(semelhancaDeNomes('Ana Souza', 'Maria Souza')).toBeLessThan(SEMELHANCA_MINIMA);
    expect(semelhancaDeNomes('Janaina Souza', 'Joana Sousa')).toBeLessThan(SEMELHANCA_MINIMA);
    expect(semelhancaDeNomes('Marcelo Teles', 'Marcela Teles')).toBeLessThan(SEMELHANCA_MINIMA);
  });
});

describe('sugestões', () => {
  const rh = [{ id: 'j', name: 'Janaina Sousa Coelho' }, { id: 'o', name: 'Joana Lima' }, { id: 'k', name: 'Krissley Hubert Ribeiro' }];
  it('ordenadas da mais parecida, só acima do mínimo', () => {
    const s = sugestoesPorSemelhanca('Janaina Souza', rh);
    expect(s.map((x) => x.id)).toEqual(['j']);
    expect(s[0].confianca).toBeGreaterThanOrEqual(95);
  });
  it('NUNCA vincula sozinho pela semelhança: devolve NENHUM com a sugestão para confirmar', () => {
    const r = resolverVinculoPorNome('Janaina Souza', rh);
    expect(r.tipo).toBe('NENHUM');
    expect(r.escolhido).toBeNull();
    expect(r.sugestoes[0]).toMatchObject({ id: 'j' });
  });
  it('a sugestão ignorada não volta', () => {
    expect(resolverVinculoPorNome('Janaina Souza', rh, new Set(['j'])).sugestoes).toEqual([]);
  });
  it('o casamento automático de antes continua: nome idêntico e nome curto de UMA pessoa', () => {
    expect(resolverVinculoPorNome('Joana Lima', rh)).toMatchObject({ tipo: 'EXATO', escolhido: { id: 'o' } });
    expect(resolverVinculoPorNome('Krissley Hubert', rh)).toMatchObject({ tipo: 'PARCIAL', escolhido: { id: 'k' } });
  });
});
