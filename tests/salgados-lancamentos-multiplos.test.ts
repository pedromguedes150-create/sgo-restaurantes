import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mapaDeLancamentos } from '@/lib/waste/painel-calculo';

/** v1.203.0 — Salgados: mais de um lançamento por dia, cada um com a sua foto. */

describe('mapa de lançamentos com vários lançamentos no mesmo dia', () => {
  const unidades = [{ id: 'u1', name: 'Unidade 1' }];
  it('vale a PIOR situação de foto do dia (um lançamento sem foto não some atrás do outro)', () => {
    const m = mapaDeLancamentos(unidades, ['2026-11-10'], [
      { unitId: 'u1', date: '2026-11-10', foto: 'completa' },
      { unitId: 'u1', date: '2026-11-10', foto: 'sem-foto' },
    ]);
    expect(m[0].dias[0]).toBe('sem-foto');
    expect(m[0].lancados).toBe(1); // o dia conta uma vez
  });
  it('dois lançamentos com foto continuam completos', () => {
    const m = mapaDeLancamentos(unidades, ['2026-11-10'], [
      { unitId: 'u1', date: '2026-11-10', foto: 'completa' },
      { unitId: 'u1', date: '2026-11-10', foto: 'completa' },
    ]);
    expect(m[0].dias[0]).toBe('completa');
  });
});

describe('a foto de cada lançamento não se sobrescreve (fonte)', () => {
  it('o arquivo da foto tem nome único por lançamento', () => {
    const src = readFileSync('src/app/api/waste/salgados/route.ts', 'utf8');
    expect(src).toContain("`snack-${operationalDate ?? 'hoje'}-${Date.now().toString(36)}`");
  });
  it('gravar sem launchId cria lançamento novo e nunca apaga o dia inteiro', () => {
    const src = readFileSync('src/lib/waste/salgados.ts', 'utf8');
    expect(src).not.toContain('deleteMany({ where: { unitId: input.unitId, operationalDate } })');
    expect(src).toContain('wasteSnackLaunch.create');
  });
});
