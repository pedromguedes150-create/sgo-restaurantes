import { describe, it, expect } from 'vitest';
import { datasDoPreset, ehPreset } from '@/lib/gas/periodo';

describe('presets de período do gás (puro)', () => {
  const hoje = '2026-09-23';

  it('este mês e mês passado fecham no último dia do mês', () => {
    expect(datasDoPreset('mes', hoje)).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(datasDoPreset('mesPassado', hoje)).toEqual({ start: '2026-08-01', end: '2026-08-31' });
  });

  it('"últimos N meses" começa no dia 1 de N−1 meses atrás e vai até hoje', () => {
    expect(datasDoPreset('3m', hoje)).toEqual({ start: '2026-07-01', end: hoje });
    expect(datasDoPreset('6m', hoje)).toEqual({ start: '2026-04-01', end: hoje });
    expect(datasDoPreset('12m', hoje)).toEqual({ start: '2025-10-01', end: hoje });
  });

  it('atravessa o ano sem estourar', () => {
    expect(datasDoPreset('mesPassado', '2026-01-15')).toEqual({ start: '2025-12-01', end: '2025-12-31' });
    expect(datasDoPreset('3m', '2026-01-15')).toEqual({ start: '2025-11-01', end: '2026-01-15' });
  });

  it('este ano e custom', () => {
    expect(datasDoPreset('ano', hoje)).toEqual({ start: '2026-01-01', end: hoje });
    expect(datasDoPreset('custom', hoje)).toBeNull();
  });

  it('reconhece só os presets declarados', () => {
    expect(ehPreset('3m')).toBe(true);
    expect(ehPreset('90d')).toBe(false);
  });
});
