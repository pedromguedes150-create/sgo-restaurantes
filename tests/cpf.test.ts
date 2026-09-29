import { describe, it, expect } from 'vitest';
import { validarCpf, formatarCpf, limparCpf } from '@/lib/cpf';

describe('limparCpf', () => {
  it('remove pontos e traço', () => {
    expect(limparCpf('123.456.789-09')).toBe('12345678909');
  });
  it('remove espaços e letras', () => {
    expect(limparCpf(' 123 abc 456 ')).toBe('123456');
  });
  it('retorna vazio se não há dígitos', () => {
    expect(limparCpf('abc')).toBe('');
  });
});

describe('formatarCpf', () => {
  it('formata 11 dígitos', () => {
    expect(formatarCpf('12345678909')).toBe('123.456.789-09');
  });
  it('devolve o original se não tem 11 dígitos', () => {
    expect(formatarCpf('123')).toBe('123');
  });
  it('aceita entrada já formatada (limpa e reformata)', () => {
    expect(formatarCpf('123.456.789-09')).toBe('123.456.789-09');
  });
});

describe('validarCpf', () => {
  const VALIDOS = [
    '529.982.247-25',
    '11144477735',
    '453.178.287-91',
    '347.066.120-04',
  ];
  const INVALIDOS = [
    '000.000.000-00',
    '111.111.111-11',
    '222.222.222-22',
    '999.999.999-99',
    '123.456.789-00', // dígitos verificadores errados
    '12345678',       // curto demais
    '123456789012',   // longo demais
    '',
    'abc',
  ];

  for (const cpf of VALIDOS) {
    it(`aceita CPF válido: ${cpf}`, () => {
      expect(validarCpf(cpf)).toBe(true);
    });
  }

  for (const cpf of INVALIDOS) {
    it(`rejeita CPF inválido: "${cpf}"`, () => {
      expect(validarCpf(cpf)).toBe(false);
    });
  }

  it('aceita com e sem máscara', () => {
    expect(validarCpf('52998224725')).toBe(true);
    expect(validarCpf('529.982.247-25')).toBe(true);
  });
});
