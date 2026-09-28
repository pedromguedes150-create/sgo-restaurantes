import { describe, it, expect } from 'vitest';
import { mascarar, pareceChaveDoSgo, pedacosDaChave, PREFIXO_DA_CHAVE, situacaoDaChave, API_BASE_PATH, HEADER_API_KEY } from '@/lib/api-global/formato';

/** API GLOBAL — a parte pura (v1.129.0). */
describe('formato da chave', () => {
  const chave = `${PREFIXO_DA_CHAVE}AbCdEfGh${'x'.repeat(36)}wxyz`;

  it('reconhece a chave do SGO e recusa o que não é', () => {
    expect(pareceChaveDoSgo(chave)).toBe(true);
    expect(pareceChaveDoSgo('Bearer abc')).toBe(false);
    expect(pareceChaveDoSgo(`${PREFIXO_DA_CHAVE}curta`)).toBe(false);
    expect(pareceChaveDoSgo(null)).toBe(false);
  });

  it('na tela e no banco ficam só o começo e os 4 últimos — nunca a chave', () => {
    const p = pedacosDaChave(chave);
    expect(p).toEqual({ keyPrefix: `${PREFIXO_DA_CHAVE}AbCdEfGh`, keyLast4: 'wxyz' });
    const m = mascarar(p.keyPrefix, p.keyLast4);
    expect(m).toBe(`${PREFIXO_DA_CHAVE}AbCdEfGh…wxyz`);
    expect(m.length).toBeLessThan(chave.length / 2);
  });

  it('situação: revogada vence desativada', () => {
    expect(situacaoDaChave({ active: true, revokedAt: null })).toBe('ATIVA');
    expect(situacaoDaChave({ active: false, revokedAt: null })).toBe('DESATIVADA');
    expect(situacaoDaChave({ active: true, revokedAt: new Date() })).toBe('REVOGADA');
  });

  it('constantes públicas do contrato', () => {
    expect(API_BASE_PATH).toBe('/api/v1');
    expect(HEADER_API_KEY).toBe('X-API-Key');
  });
});
