import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * FASE 4 DO KIT — lote 7 (último): Configurações → Checklists. A página é um
 * componente de servidor com Prisma (não renderiza no teste), então o que se
 * trava é a FONTE: as quatro seções são as sub-abas do cabeçalho do kit
 * (links com `active` pela URL), e a barra segmentada antiga saiu.
 */
describe('Configurações → Checklists no kit', () => {
  const src = readFileSync(join(process.cwd(), 'src/app/(app)/configuracoes/checklists/page.tsx'), 'utf8');

  it('as seções viram tabs do LargeTitle, ativa pela URL', () => {
    expect(src).toContain("title=\"Checklists\"");
    expect(src).toContain('tabs={TABS.map((t) => ({');
    expect(src).toContain('href: `/configuracoes/checklists?tab=${t.key}`, active: tab === t.key');
    for (const k of ['unidades', 'resumo', 'modelos', 'supervisor']) expect(src).toContain(`key: '${k}'`);
  });

  it('a barra segmentada antiga saiu', () => {
    expect(src).not.toContain('SegmentedNav');
  });
});
