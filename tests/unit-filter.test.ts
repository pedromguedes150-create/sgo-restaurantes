import { describe, it, expect } from 'vitest';
import { resolveUnitFilter, TODAS_AS_UNIDADES } from '@/lib/scope/unit-filter';

/**
 * O app tinha dois filtros de unidade que não se falavam: o seletor do
 * cabeçalho (`?unidade=` + cookie) e o filtro das telas (`?unit=`, dos atalhos
 * do Dashboard). O cabeçalho dizia "Moreira" e a lista mostrava a rede inteira.
 */

const acesso = ['moreira', 'centro', 'sul'];

describe('resolveUnitFilter', () => {
  it('sem parâmetro nenhum, obedece o seletor do cabeçalho', () => {
    const r = resolveUnitFilter({}, acesso, 'moreira');
    expect(r.ids).toEqual(['moreira']);
    expect(r.all).toBe(false);
    expect(r.source).toBe('seletor');
  });

  it('?unit=todas vence o seletor — é o "ver todas" explícito', () => {
    const r = resolveUnitFilter({ unit: TODAS_AS_UNIDADES }, acesso, 'moreira');
    expect(r.all).toBe(true);
    expect(r.ids).toEqual(acesso);
  });

  it('?unit= explícito vence o seletor (atalho do Dashboard)', () => {
    const r = resolveUnitFilter({ unit: 'centro' }, acesso, 'moreira');
    expect(r.ids).toEqual(['centro']);
    expect(r.source).toBe('param');
  });

  it('?unidade= (seletor refletido na URL) vale quando não há ?unit=', () => {
    expect(resolveUnitFilter({ unidade: 'sul' }, acesso, 'moreira').ids).toEqual(['sul']);
  });

  it('várias unidades no ?unit= continuam valendo', () => {
    const r = resolveUnitFilter({ unit: 'moreira,centro' }, acesso, 'sul');
    expect(r.ids.sort()).toEqual(['centro', 'moreira']);
    expect(r.all).toBe(false);
  });

  it('unidade fora do alcance é ignorada — escopo nunca aumenta', () => {
    /* Filtro de tela, não autorização: pedir uma unidade que não é sua não
       pode revelar nada. */
    const r = resolveUnitFilter({ unit: 'de-outro-grupo' }, acesso, null);
    expect(r.ids).toEqual(acesso);
    expect(r.all).toBe(true);
    expect(resolveUnitFilter({ unidade: 'de-outro-grupo' }, acesso, null).all).toBe(true);
  });

  it('com uma unidade só, nunca diz "filtrado"', () => {
    /* Senão a tela ofereceria um "ver todas as unidades" que não muda nada. */
    const r = resolveUnitFilter({}, ['moreira'], 'moreira');
    expect(r.all).toBe(true);
  });

  it('sem seletor e sem parâmetro, mostra todas', () => {
    expect(resolveUnitFilter({}, acesso, null).all).toBe(true);
  });

  it('usuário sem unidade alguma não quebra', () => {
    const r = resolveUnitFilter({ unit: 'x' }, [], 'x');
    expect(r.ids).toEqual([]);
    expect(r.all).toBe(true);
  });
});
