import { describe, it, expect } from 'vitest';
import { blocosDePagamento, motivoDoPagamento, segundaDoPagamento, type Lancamento } from '@/lib/payments/consolidacao-calculo';

/**
 * Planilha de pagamento no padrão do Financeiro (v1.160.1, Pedro): CONSOLIDADO
 * = o que pagar em cada segunda-feira, uma linha por unidade × colaborador;
 * hora extra em bloco próprio por competência (cartão). Só leitura.
 */
const l = (p: Partial<Lancamento> & { data: string }): Lancamento => ({
  id: p.data + (p.pessoa ?? '') + (p.unitId ?? ''), unitId: 'u1', unidade: 'Centro', tipo: 'FREELANCER', pessoaChave: `F:${p.pessoa ?? 'ana'}`, pessoa: p.pessoa ?? 'ana',
  horas: null, vt: 0, valor: 100, status: 'APPROVED', motivo: null, solicitadoPor: null, dataSolicitacao: p.data, semVinculoRh: false,
  cpf: '12345678901', pixKey: 'ana@pix', pagarEm: p.tipo === 'OVERTIME' ? null : segundaDoPagamento(p.data), pagoEm: null, ...p,
});

describe('blocosDePagamento', () => {
  it('freelancer: um bloco por segunda, uma linha por unidade × pessoa, com dias e motivos', () => {
    const xs = [
      l({ data: '2026-09-29', pessoa: 'ana', valor: 120, motivo: 'Cobertura: Cozinha' }),
      l({ data: '2026-10-02', pessoa: 'ana', valor: 130 }),
      l({ data: '2026-10-03', pessoa: 'bia', valor: 200, unitId: 'u2', unidade: 'Orla', cpf: null, pixKey: null }),
      l({ data: '2026-10-07', pessoa: 'ana', valor: 100 }),
      l({ data: '2026-10-01', pessoa: 'rej', status: 'REJECTED' }),
      l({ data: '2026-10-01', pessoa: 'carlos', tipo: 'OVERTIME', horas: 5, valor: 110, motivo: 'Evento', pessoaChave: 'C:carlos', pagarEm: null }),
    ];
    const b = blocosDePagamento(xs, 'TODOS');
    expect(b.segundas.map((s) => s.pagarEm)).toEqual(['2026-10-05', '2026-10-12']);
    const s1 = b.segundas[0];
    expect(s1).toMatchObject({ semanaDe: '2026-09-28', semanaAte: '2026-10-04', qtd: 3, total: 450 });
    expect(s1.linhas.map((x) => [x.unidade, x.data, x.colaborador, x.lancamentos, x.total])).toEqual([
      ['Centro', '2026-10-05', 'ana', 2, 250],
      ['Orla', '2026-10-05', 'bia', 1, 200],
    ]);
    expect(s1.linhas[0].motivo).toBe('Freelancer · dias 29/09, 02/10 · Cobertura: Cozinha');
    expect(s1.linhas[0]).toMatchObject({ cpf: '12345678901', pixKey: 'ana@pix' });
    // hora extra: bloco próprio, competência = mês seguinte ao serviço
    expect(b.horaExtra).toHaveLength(1);
    expect(b.horaExtra[0]).toMatchObject({ competencia: '2026-11', rotulo: '11/2026', qtd: 1, total: 110 });
    expect(b.horaExtra[0].linhas[0]).toMatchObject({ data: 'comp. 11/2026', colaborador: 'carlos', motivo: 'Hora extra 5h · dia 01/10 · Evento' });
  });

  it('a rejeitada fica fora, salvo no filtro Rejeitado', () => {
    const xs = [l({ data: '2026-09-29', status: 'REJECTED' })];
    expect(blocosDePagamento(xs, 'TODOS').segundas).toEqual([]);
    expect(blocosDePagamento(xs, 'REJECTED').segundas[0]).toMatchObject({ qtd: 1, total: 100 });
  });

  it('motivo do pagamento sem motivos cadastrados', () => {
    expect(motivoDoPagamento([l({ data: '2026-10-02' })])).toBe('Freelancer · dia 02/10');
  });
});
