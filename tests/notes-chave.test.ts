import { describe, it, expect } from 'vitest';
import { parseChaveAcesso, formatCnpj, chaveConfere, digitoVerificadorDaChave } from '@/lib/notes/chave';

describe('chave de acesso NFe (44 dígitos)', () => {
  it('extrai CNPJ e data de emissão', () => {
    // cUF=35 AAMM=2403 CNPJ=12345678000199 mod=55 ... (preenchido p/ 44 dígitos)
    const chave = '35' + '2403' + '12345678000199' + '55' + '001' + '000000123' + '1' + '00000000' + '0';
    expect(chave.length).toBe(44);
    const d = parseChaveAcesso(chave);
    expect(d.valid).toBe(true);
    expect(d.cnpj).toBe('12345678000199');
    expect(d.cnpjFormatted).toBe('12.345.678/0001-99');
    expect(d.number).toBe('123');
    expect(d.issueDate?.toISOString().slice(0, 7)).toBe('2024-03');
  });

  it('rejeita chave com tamanho errado', () => {
    expect(parseChaveAcesso('123').valid).toBe(false);
  });

  it('formata CNPJ', () => {
    expect(formatCnpj('12345678000199')).toBe('12.345.678/0001-99');
  });
});

describe('dígito verificador da chave (v1.206.0)', () => {
  /* A chave REAL da nota 1.536.433 (P&P Distribuidora, 12/11/2026). */
  const REAL = '31261101831532000133550030015364331384739044';
  /* O que a câmera leu: pares de dígitos trocados → nota "2.536.433", CNPJ /0002-33, emissão 08/2024. */
  const LIDA_ERRADA = '04240801831532000233550030025364331384739044';

  it('a chave real confere e dá o número certo', () => {
    expect(chaveConfere(REAL)).toBe(true);
    const d = parseChaveAcesso(REAL);
    expect(d.confere).toBe(true);
    expect(d.number).toBe('1536433');
    expect(d.cnpjFormatted).toBe('01.831.532/0001-33');
    expect(d.issueDate?.toISOString().slice(0, 7)).toBe('2026-11');
  });

  it('a leitura errada do print NÃO confere', () => {
    expect(chaveConfere(LIDA_ERRADA)).toBe(false);
    expect(parseChaveAcesso(LIDA_ERRADA)).toMatchObject({ valid: true, confere: false });
  });

  it('um único dígito trocado já derruba a chave', () => {
    const trocada = REAL.slice(0, 25) + '002536433' + REAL.slice(34); // 1.536.433 → 2.536.433
    expect(chaveConfere(trocada)).toBe(false);
  });

  it('calcula o dígito pelo módulo 11', () => {
    expect(digitoVerificadorDaChave(REAL.slice(0, 43))).toBe(4);
  });

  it('UF inexistente ou mês inválido não conferem, nem com o dígito "certo"', () => {
    const semUf = '99' + REAL.slice(2, 43);
    expect(chaveConfere(semUf + digitoVerificadorDaChave(semUf))).toBe(false);
    const mes13 = REAL.slice(0, 4) + '13' + REAL.slice(6, 43);
    expect(chaveConfere(mes13 + digitoVerificadorDaChave(mes13))).toBe(false);
  });
});
