import { describe, it, expect } from 'vitest';
import { porSegundaDePagamento, rotuloSegunda, segundaDoPagamento, type Lancamento } from '@/lib/payments/consolidacao-calculo';

/**
 * Segunda-feira do pagamento (v1.160.0). Regra da operação (Pedro, 07/10/2026):
 * freelancer solicitado de segunda a domingo é pago na SEGUNDA SEGUINTE. Só
 * informação derivada — nenhum status, valor ou data gravada muda.
 */
const l = (p: Partial<Lancamento> & { data: string }): Lancamento => ({
  id: p.data + (p.pessoa ?? ''), unitId: 'u', unidade: 'U', tipo: 'FREELANCER', pessoaChave: `F:${p.pessoa ?? 'a'}`, pessoa: p.pessoa ?? 'a',
  horas: null, vt: 0, valor: 100, status: 'APPROVED', motivo: null, solicitadoPor: null, dataSolicitacao: p.data, semVinculoRh: false,
  cpf: null, pixKey: null, pagarEm: segundaDoPagamento(p.data), pagoEm: null, ...p,
});

describe('segundaDoPagamento', () => {
  it('qualquer dia da semana seg→dom cai na segunda SEGUINTE', () => {
    // 28/09/2026 é segunda; 04/10/2026 é domingo → pagar em 05/10 (segunda)
    expect(segundaDoPagamento('2026-09-28')).toBe('2026-10-05');
    expect(segundaDoPagamento('2026-09-30')).toBe('2026-10-05');
    expect(segundaDoPagamento('2026-10-03')).toBe('2026-10-05'); // sábado
    expect(segundaDoPagamento('2026-10-04')).toBe('2026-10-05'); // domingo
    expect(segundaDoPagamento('2026-10-05')).toBe('2026-10-12'); // a segunda em si é da semana seguinte
    expect(rotuloSegunda('2026-10-05')).toBe('seg. 05/10/2026');
  });
});

describe('porSegundaDePagamento', () => {
  it('agrupa só freelancers pela segunda, separando pago / a pagar / pendente; hora extra fica fora', () => {
    const xs = [
      l({ data: '2026-09-29', pessoa: 'ana', status: 'PAID', pagoEm: '2026-10-05' }),
      l({ data: '2026-10-02', pessoa: 'ana', status: 'APPROVED' }),
      l({ data: '2026-10-04', pessoa: 'bia', status: 'PENDING', valor: 50 }),
      l({ data: '2026-10-01', pessoa: 'rej', status: 'REJECTED' }),
      l({ data: '2026-10-07', pessoa: 'ana', status: 'APPROVED' }),
      l({ data: '2026-10-01', pessoa: 'he', tipo: 'OVERTIME', pagarEm: null }),
    ];
    const r = porSegundaDePagamento(xs, 'TODOS', '2026-10-07');
    expect(r.map((s) => s.pagarEm)).toEqual(['2026-10-05', '2026-10-12']);
    expect(r[0]).toMatchObject({ semanaDe: '2026-09-28', semanaAte: '2026-10-04', qtd: 3, freelancers: 2, valor: 250, pago: 100, aPagar: 100, pendente: 50, atrasado: true });
    expect(r[1]).toMatchObject({ qtd: 1, aPagar: 100, atrasado: false });
  });
  it('a rejeitada só entra quando o filtro é Rejeitado; sem aprovado não há atraso', () => {
    const xs = [l({ data: '2026-09-29', status: 'REJECTED' }), l({ data: '2026-09-30', status: 'PAID' })];
    expect(porSegundaDePagamento(xs, 'REJECTED', '2026-10-07')).toMatchObject([{ qtd: 1, valor: 100, atrasado: false }]);
    expect(porSegundaDePagamento(xs, 'TODOS', '2026-10-07')).toMatchObject([{ qtd: 1, pago: 100, atrasado: false }]);
  });
});
