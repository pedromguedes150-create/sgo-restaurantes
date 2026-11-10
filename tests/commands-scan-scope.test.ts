import { describe, it, expect } from 'vitest';
import { escopoDoLeitor } from '@/lib/commands/scan-scope';

/**
 * v1.200.0: bipar uma comanda FORA da faixa do dia NÃO muda o escopo. A comanda
 * é identificada (`foraDaFaixa`) e fica de fora da conta; conferir tudo é uma
 * conferência COMPLETA, iniciada de propósito (ou ampliada com autorização).
 */

const faixa = (de: number, ate: number) => new Set(Array.from({ length: ate - de + 1 }, (_, i) => de + i));

const ATIVAS = faixa(1, 648);
const DO_DIA = faixa(1, 300);

describe('Com faixa do dia configurada', () => {
  it('bipando só dentro da faixa, a conferência é parcial', () => {
    const r = escopoDoLeitor(ATIVAS, DO_DIA, true, [1, 50, 300]);
    expect(r.completa).toBe(false);
    expect(r.escopo.size).toBe(300);
    expect(r.foraDaFaixa).toEqual([]);
  });

  it('UMA comanda acima da faixa é identificada, mas NÃO torna a conferência completa', () => {
    const r = escopoDoLeitor(ATIVAS, DO_DIA, true, [1, 50, 301]);
    expect(r.completa).toBe(false);
    expect(r.escopo.size).toBe(300);
    expect(r.foraDaFaixa).toEqual([301]);
  });

  it('diz QUAIS estavam fora, em ordem', () => {
    /* A tela precisa explicar por que mudou de modo — senão o caixa vê o
       contador saltar de 300 para 648 sem entender. */
    const r = escopoDoLeitor(ATIVAS, DO_DIA, true, [500, 10, 350]);
    expect(r.foraDaFaixa).toEqual([350, 500]);
  });

  it('número que não é da unidade NÃO muda o escopo', () => {
    /* Bipar a comanda de outra unidade, ou um código estranho, é erro de
       leitura — não uma decisão de fazer a contagem completa. */
    const r = escopoDoLeitor(ATIVAS, DO_DIA, true, [10, 9999]);
    expect(r.completa).toBe(false);
    expect(r.foraDaFaixa).toEqual([]);
  });

  it('nada bipado ainda: começa parcial', () => {
    const r = escopoDoLeitor(ATIVAS, DO_DIA, true, []);
    expect(r.completa).toBe(false);
    expect(r.escopo.size).toBe(300);
  });

  it('a borda da faixa pertence à faixa; a de fora é só avisada', () => {
    expect(escopoDoLeitor(ATIVAS, DO_DIA, true, [300]).foraDaFaixa).toEqual([]);
    const r = escopoDoLeitor(ATIVAS, DO_DIA, true, [301]);
    expect(r.completa).toBe(false);
    expect(r.foraDaFaixa).toEqual([301]);
  });
});

describe('Sem faixa do dia', () => {
  it('a unidade sempre confere tudo — e isso é uma contagem completa', () => {
    const r = escopoDoLeitor(ATIVAS, new Set(), false, [1, 2, 3]);
    expect(r.completa).toBe(true);
    expect(r.escopo.size).toBe(648);
    expect(r.foraDaFaixa).toEqual([]);
  });
});

describe('Casos degenerados', () => {
  it('faixa igual às ativas não deixa de ser parcial por bipar qualquer coisa', () => {
    /* Se a faixa cobre tudo, não existe "fora da faixa". */
    const r = escopoDoLeitor(ATIVAS, ATIVAS, true, [648]);
    expect(r.completa).toBe(false);
    expect(r.foraDaFaixa).toEqual([]);
  });

  it('unidade sem comandas ativas não estoura', () => {
    const r = escopoDoLeitor(new Set(), new Set(), true, [1]);
    expect(r.completa).toBe(false);
    expect(r.escopo.size).toBe(0);
  });
});
