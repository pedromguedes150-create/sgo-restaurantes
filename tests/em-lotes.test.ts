import { describe, it, expect } from 'vitest';
import { emLotes } from '@/lib/async/em-lotes';

/**
 * Paralelo limitado (v1.158.1): o Dashboard/Metas/Supervisão deixam de calcular
 * uma unidade por vez. O que se trava: a ORDEM de saída é a dos itens (não a de
 * término), nunca roda mais do que o limite ao mesmo tempo, e erro propaga.
 */
const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('emLotes', () => {
  it('devolve na ordem dos itens, mesmo quando o primeiro termina por último', async () => {
    const out = await emLotes([30, 5, 15], 3, async (ms) => { await dorme(ms); return `t${ms}`; });
    expect(out).toEqual(['t30', 't5', 't15']);
  });

  it('nunca passa do limite em andamento', async () => {
    let ativos = 0, pico = 0;
    await emLotes(Array.from({ length: 10 }, (_, i) => i), 4, async () => {
      ativos++; pico = Math.max(pico, ativos);
      await dorme(5);
      ativos--;
    });
    expect(pico).toBe(4);
  });

  it('lista vazia, limite inválido e erro', async () => {
    expect(await emLotes([], 4, async (x) => x)).toEqual([]);
    expect(await emLotes([1, 2], 0, async (x) => x * 2)).toEqual([2, 4]);
    await expect(emLotes([1, 2], 2, async (x) => { if (x === 2) throw new Error('boom'); return x; })).rejects.toThrow('boom');
  });
});
