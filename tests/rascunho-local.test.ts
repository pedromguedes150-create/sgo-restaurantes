import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { apagarRascunho, gravarRascunho, lerRascunho, lerFotoLocal, guardarFotoLocal } from '@/lib/rascunho-local';

/**
 * v1.181.1 — rascunho local da folha de Sobras Lanchonete: o que o gerente
 * digitou sobrevive ao recarregamento que o Android faz ao voltar da câmera.
 */
function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; },
  } as Storage;
}
const g = globalThis as unknown as { window?: unknown };
let antes: unknown;
beforeEach(() => { antes = g.window; g.window = { localStorage: fakeStorage() }; });
afterEach(() => { g.window = antes; });

describe('rascunho em localStorage', () => {
  it('grava, lê e apaga por chave — com o prefixo do SGO', () => {
    gravarRascunho('salgados:u1:2026-11-03', [{ typeId: 't', reasonId: 'r', qty: '2' }]);
    expect(lerRascunho('salgados:u1:2026-11-03')).toEqual([{ typeId: 't', reasonId: 'r', qty: '2' }]);
    expect((g.window as { localStorage: Storage }).localStorage.getItem('sgo-rascunho:salgados:u1:2026-11-03')).not.toBeNull();
    apagarRascunho('salgados:u1:2026-11-03');
    expect(lerRascunho('salgados:u1:2026-11-03')).toBeNull();
  });
  it('sem armazenamento (lança) a tela não quebra: leitura nula, escrita calada', () => {
    g.window = { localStorage: { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); }, removeItem: () => { throw new Error('bloqueado'); } } };
    expect(() => gravarRascunho('x', 1)).not.toThrow();
    expect(lerRascunho('x')).toBeNull();
    expect(() => apagarRascunho('x')).not.toThrow();
  });
  it('a foto: sem IndexedDB no ambiente, guardar é calado e ler devolve nulo', async () => {
    await expect(guardarFotoLocal('x', new File(['a'], 'a.jpg', { type: 'image/jpeg' }))).resolves.toBeUndefined();
    await expect(lerFotoLocal('x')).resolves.toBeNull();
  });
});

describe('a folha de Sobras Lanchonete usa o rascunho (fonte)', () => {
  const src = readFileSync('src/components/waste/salgados-form.tsx', 'utf8');
  it('grava as linhas a cada mudança, guarda a foto ao tirar, recupera ao montar e limpa ao salvar', () => {
    expect(src).toContain("from '@/lib/rascunho-local'");
    expect(src).toContain('gravarRascunho(chaveDoRascunho, linhas)');
    expect(src).toContain('guardarFotoLocal(chaveDoRascunho, f)');
    expect(src).toContain('lerRascunho<Linha[]>(chaveDoRascunho)');
    expect(src).toContain('lerFotoLocal(chaveDoRascunho)');
    expect(src).toContain('apagarRascunho(chaveDoRascunho)');
    expect(src).toContain('apagarFotoLocal(chaveDoRascunho)');
    expect(src).toContain('data-testid="rascunho-recuperado"');
  });
});
