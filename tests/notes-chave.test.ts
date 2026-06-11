import { describe, it, expect } from 'vitest';
import { parseChaveAcesso, formatCnpj } from '@/lib/notes/chave';

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
