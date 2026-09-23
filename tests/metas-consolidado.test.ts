import { describe, it, expect } from 'vitest';
import { calcularStats, zoneDaScore } from '@/lib/metas/consolidado';
import type { MetaRankingRow } from '@/lib/metas/query';

function makeRanking(scores: number[]): MetaRankingRow[] {
  return scores.map((s, i) => ({ unitId: `u${i}`, name: `Unidade ${i}`, scorePct: s }));
}

describe('calcularStats', () => {
  it('returns zeros for empty ranking', () => {
    expect(calcularStats([])).toEqual({ media: 0, melhor: 0, dentroDaMeta: 0, atencao: 0, criticas: 0 });
  });

  it('classifies correctly: ≥80 na meta, 50-79 atenção, <50 crítica', () => {
    const ranking = makeRanking([100, 80, 79, 50, 49, 0]);
    const stats = calcularStats(ranking);
    expect(stats.dentroDaMeta).toBe(2); // 100 e 80
    expect(stats.atencao).toBe(2); // 79 e 50
    expect(stats.criticas).toBe(2); // 49 e 0
  });

  it('computes media as rounded average', () => {
    const ranking = makeRanking([70, 80, 90]);
    const stats = calcularStats(ranking);
    expect(stats.media).toBe(80);
  });

  it('computes melhor as maximum', () => {
    const ranking = makeRanking([60, 55, 90, 70]);
    expect(calcularStats(ranking).melhor).toBe(90);
  });

  it('single unit: all zeros except the one', () => {
    const ranking = makeRanking([75]);
    const stats = calcularStats(ranking);
    expect(stats.media).toBe(75);
    expect(stats.melhor).toBe(75);
    expect(stats.atencao).toBe(1);
    expect(stats.dentroDaMeta).toBe(0);
    expect(stats.criticas).toBe(0);
  });

  it('all units on meta', () => {
    const ranking = makeRanking([80, 85, 100, 90]);
    const stats = calcularStats(ranking);
    expect(stats.dentroDaMeta).toBe(4);
    expect(stats.atencao).toBe(0);
    expect(stats.criticas).toBe(0);
  });
});

describe('zoneDaScore', () => {
  it('returns success for ≥80', () => {
    expect(zoneDaScore(80)).toBe('success');
    expect(zoneDaScore(100)).toBe('success');
  });

  it('returns warning for 50-79', () => {
    expect(zoneDaScore(50)).toBe('warning');
    expect(zoneDaScore(79)).toBe('warning');
  });

  it('returns danger for <50', () => {
    expect(zoneDaScore(0)).toBe('danger');
    expect(zoneDaScore(49)).toBe('danger');
  });
});
