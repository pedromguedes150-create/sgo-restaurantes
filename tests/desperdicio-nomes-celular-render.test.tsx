import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/desperdicios',
}));

/** Desperdícios (v1.178.1): nomes "Sobras Restaurantes" × "Sobras Lanchonete" e a linha da lanchonete empilhada no celular. */

describe('nomes das duas frentes', () => {
  it('as abas e o consolidado usam os nomes novos', () => {
    const pagina = readFileSync('src/app/(app)/modulos/desperdicios/page.tsx', 'utf8');
    expect(pagina).toContain("label: 'Sobras Restaurantes'");
    expect(pagina).toContain("label: 'Sobras Lanchonete'");
    expect(pagina).not.toContain("'Sobras Salgados'");
    const consolidado = readFileSync('src/app/(app)/modulos/desperdicios/consolidado/page.tsx', 'utf8');
    expect(consolidado).toContain('Sobras Lanchonete (unidades)');
  });
});

describe('linha da lanchonete no celular', () => {
  it('uma coisa por linha no celular e cada Select no próprio invólucro (o className do Select vai no botão)', () => {
    const src = readFileSync('src/components/waste/salgados-form.tsx', 'utf8');
    expect(src).toContain('grid grid-cols-1 gap-2 rounded-card border border-line p-2 sm:grid-cols-[1fr_1fr_5rem_auto]');
    expect(src).not.toContain('className="col-span-2 sm:col-span-1"');
    expect((src.match(/<div className="min-w-0">\s*<Select/g) ?? []).length).toBe(2);
    expect(src).toContain("'Salvar sobras da lanchonete'");
  });
});
