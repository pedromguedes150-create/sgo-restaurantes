import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Alerta do banheiro no aparelho (v1.156.0): o service worker trata o push
 * 'higiene' com vibração PRÓPRIA, fica na tela até ser tocado e avisa as abas
 * abertas (que tocam o som). O envio precisa carregar o tipo do alerta.
 */
const sw = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');
const send = readFileSync(join(process.cwd(), 'src/lib/push/send.ts'), 'utf8');

describe('push do banheiro', () => {
  it('vibração própria, fica na tela e avisa as abas', () => {
    expect(sw).toContain("data.alerta === 'higiene'");
    expect(sw).toMatch(/VIBRA_HIGIENE = \[500, 150, 500, 150, 500, 150, 900\]/);
    expect(sw).toContain('requireInteraction: higiene ||');
    expect(sw).toContain("postMessage({ tipo: 'sgo-alerta', alerta: 'higiene'");
  });
  it('o envio carrega o tipo do alerta e a etiqueta própria', () => {
    expect(send).toContain('alerta: p.alerta,');
    expect(send).toContain('tag: p.tag ??');
  });
});
