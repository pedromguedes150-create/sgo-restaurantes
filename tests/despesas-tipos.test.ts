import { describe, it, expect } from 'vitest';
import { CATEGORIAS, ORIGEM_FIXA, STATUS, categoriaValida, statusValido, totais, valorValido } from '@/lib/expenses/tipos';

/**
 * DESPESAS = dinheiro que saiu do COFRE. A regra é fixa e este arquivo a trava:
 * não há segunda origem para escolher em lugar nenhum.
 */
describe('A origem é fixa: COFRE', () => {
  it('só existe uma origem, e é o cofre', () => {
    expect(ORIGEM_FIXA).toBe('SAFE');
  });

  it('as categorias são as seis combinadas, sem "origem" disfarçada de categoria', () => {
    expect(CATEGORIAS.map((c) => c.label)).toEqual(['Manutenção', 'Compra emergencial', 'Alimentação', 'Transporte/Frete', 'Material', 'Outros']);
    expect(CATEGORIAS.some((c) => /caixa|cofre/i.test(c.label))).toBe(false);
    expect(categoriaValida('FOOD')).toBe(true);
    expect(categoriaValida('CAIXA')).toBe(false);
  });

  it('status: pendente de devolução → devolvida (cancelada preparada, sem tela)', () => {
    expect(STATUS.map((s) => s.value)).toEqual(['PENDING_REFUND', 'REFUNDED', 'CANCELED']);
    expect(statusValido('REFUNDED')).toBe(true);
    expect(statusValido('PAID')).toBe(false);
  });
});

describe('Os três cartões', () => {
  it('total = o que saiu do cofre; pendente = falta recompor; devolvido', () => {
    const t = totais([
      { amount: 150, status: 'PENDING_REFUND' },
      { amount: 80.5, status: 'REFUNDED' },
      { amount: 20, status: 'PENDING_REFUND' },
    ]);
    expect(t).toEqual({ total: 250.5, pendente: 170, devolvido: 80.5, qtdPendente: 2, qtd: 3 });
  });

  it('cancelada não saiu do cofre: fica fora de tudo', () => {
    const t = totais([{ amount: 100, status: 'CANCELED' }, { amount: 10, status: 'PENDING_REFUND' }]);
    expect(t.total).toBe(10);
    expect(t.qtd).toBe(1);
  });

  it('centavos não acumulam erro', () => {
    expect(totais([{ amount: 0.1, status: 'REFUNDED' }, { amount: 0.2, status: 'REFUNDED' }]).devolvido).toBe(0.3);
  });
});

describe('Valor', () => {
  it('positivo, finito e até o teto', () => {
    expect(valorValido(150)).toBe(true);
    expect(valorValido(0)).toBe(false);
    expect(valorValido(-5)).toBe(false);
    expect(valorValido(NaN)).toBe(false);
    expect(valorValido(100001)).toBe(false);
    expect(valorValido('150')).toBe(false);
  });
});
