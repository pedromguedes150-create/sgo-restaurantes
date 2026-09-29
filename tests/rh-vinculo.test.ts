import { describe, it, expect } from 'vitest';
import { normalizarCnpj, filtrarPorCnpj, decidirVinculo } from '@/lib/rh/vinculo';
import type { RhColaborador } from '@/lib/rh/normalize';

/**
 * VÍNCULO unidade ↔ empresa do RH (v1.132.0): CNPJ primeiro, razão social como
 * fallback, empresas fora do SGO ignoradas.
 */
const p = (matricula: string, unidade_cnpj: string | null, unidade = 'X'): RhColaborador =>
  ({ matricula, nome: `N${matricula}`, cpf: null, status: 'Ativo', unidade, unidade_cnpj, cargo: null, admissao: null });

describe('normalizarCnpj', () => {
  it('ignora ., / e -; exige 14 dígitos', () => {
    expect(normalizarCnpj('12.345.678/0001-90')).toBe('12345678000190');
    expect(normalizarCnpj('12345678000190')).toBe('12345678000190');
    expect(normalizarCnpj('123')).toBeNull();
    expect(normalizarCnpj('')).toBeNull();
    expect(normalizarCnpj(null)).toBeNull();
  });
});

describe('filtrarPorCnpj', () => {
  it('só quem tem o CNPJ da unidade, comparando sem formatação; o resto do RH é ignorado', () => {
    const lista = [p('1', '12.345.678/0001-90'), p('2', '12345678000190'), p('3', '99.999.999/0001-99'), p('4', null)];
    expect(filtrarPorCnpj(lista, '12345678000190').map((c) => c.matricula)).toEqual(['1', '2']);
    expect(filtrarPorCnpj(lista, 'inválido')).toEqual([]);
  });
});

describe('decidirVinculo', () => {
  it('CNPJ com correspondência vence; sem correspondência cai na razão social; sem nada, SEM_VINCULO', () => {
    expect(decidirVinculo({ cnpj: '12345678000190', rhUnitName: 'RAZAO' }, [p('1', '12345678000190')])).toEqual({ vinculo: 'CNPJ' });
    expect(decidirVinculo({ cnpj: '12345678000190', rhUnitName: 'RAZAO' }, [])).toEqual({ vinculo: 'RAZAO_SOCIAL' });
    expect(decidirVinculo({ cnpj: null, rhUnitName: 'RAZAO' }, null)).toEqual({ vinculo: 'RAZAO_SOCIAL' });
    expect(decidirVinculo({ cnpj: '12345678000190', rhUnitName: null }, [])).toEqual({ vinculo: 'CNPJ' });
    expect(decidirVinculo({ cnpj: null, rhUnitName: null }, null)).toEqual({ vinculo: null, motivo: 'SEM_VINCULO' });
  });
});
