import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { escolherValorHora } from '@/lib/freelancer/pricing';

describe('valor/hora do freelancer — lista autorizada (v1.226.0)', () => {
  it('sem pedido vale o padrão; as opções são o padrão + os autorizados, em ordem e sem repetir', () => {
    expect(escolherValorHora(15, [18, 17, 15, 17])).toEqual({ rate: 15, opcoes: [15, 17, 18], recusado: false });
    expect(escolherValorHora(15, [])).toEqual({ rate: 15, opcoes: [15], recusado: false });
  });
  it('pedido autorizado vale; o próprio padrão também', () => {
    expect(escolherValorHora(15, [17, 18], 17)).toMatchObject({ rate: 17, recusado: false });
    expect(escolherValorHora(15, [17, 18], 15)).toMatchObject({ rate: 15, recusado: false });
    expect(escolherValorHora(15, [17.5], 17.5)).toMatchObject({ rate: 17.5, recusado: false });
  });
  it('valor fora da lista é RECUSADO e a conta volta ao padrão', () => {
    expect(escolherValorHora(15, [17, 18], 25)).toMatchObject({ rate: 15, recusado: true });
    expect(escolherValorHora(15, [], 16)).toMatchObject({ rate: 15, recusado: true });
  });
  it('o valor já GRAVADO na solicitação continua valendo mesmo fora da lista', () => {
    expect(escolherValorHora(15, [17], 19, 19)).toMatchObject({ rate: 19, recusado: false });
    expect(escolherValorHora(15, [17], 20, 19)).toMatchObject({ rate: 15, recusado: true });
  });
  it('pedido vazio, zero ou negativo é tratado como "sem escolha"', () => {
    for (const p of [null, undefined, 0, -3]) expect(escolherValorHora(15, [17], p)).toMatchObject({ rate: 15, recusado: false });
  });
  it('o servidor confere a escolha na criação e na correção; a tela só oferece a lista', () => {
    const criar = readFileSync('src/lib/payments/create.ts', 'utf8');
    expect(criar).toContain('rate: input.hourlyRate');
    expect(criar).toContain('if (calc.rateRecusado) return');
    expect(readFileSync('src/lib/payments/approve.ts', 'utf8')).toContain('rateGravado: gravado');
    const tela = readFileSync('src/components/payments/payments-client.tsx', 'utf8');
    expect(tela).toContain('data-testid="valor-hora-do-freelancer"');
    expect(tela).not.toMatch(/label="Valor por hora"[^]{0,400}<Input/);
    expect(readFileSync('src/components/admin/freelancer-rates-config.tsx', 'utf8')).toContain("entity: 'freelancerAltRate'");
  });
});
