import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Relato do Pedro (v1.157.0): na janela "Nova nota" os campos de data "não abriam
 * o calendário". O calendário abria, mas ATRÁS da janela: ele estava em z-50 e a
 * janela do kit (SgoModal) usa --sgo-z-modal (70). O mesmo valia para os avisos
 * (toast em z-60). Teste de FONTE porque o ambiente de teste não pinta camadas.
 */
const css = readFileSync('src/styles/sgo-kit.css', 'utf8');
const z = (nome: string) => Number(new RegExp(`--sgo-z-${nome}:(\\d+)`).exec(css)?.[1]);

describe('o que flutua fica ACIMA das janelas', () => {
  it('a escala de camadas do kit põe dropdown-em-janela e aviso acima da janela', () => {
    expect(z('dropdown-in-modal')).toBeGreaterThan(z('modal'));
    expect(z('toast')).toBeGreaterThan(z('modal'));
  });

  it('o calendário usa a camada de dropdown-em-janela, não z-50', () => {
    const src = readFileSync('src/components/ui/ds/date-picker.tsx', 'utf8');
    expect(src).toContain("zIndex: 'var(--sgo-z-dropdown-in-modal)'");
    expect(src).not.toMatch(/className="z-50 w-\[17\.5rem\]/);
  });

  it('os avisos usam a camada de toast', () => {
    const src = readFileSync('src/components/ui/ds/toast.tsx', 'utf8');
    expect(src).toContain("zIndex: 'var(--sgo-z-toast)'");
    expect(src).not.toContain('z-[60]');
  });
});
