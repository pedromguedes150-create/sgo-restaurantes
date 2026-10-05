import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { textoDaPendencia } from '@/lib/nav/pendencias-puro';

/**
 * Menu (v1.154.0): o selo da área dizia "3" sem dizer ONDE, e nomes longos
 * invadiam a coluna vizinha. Trava: o texto de cada pendência, o selo POR ITEM
 * no painel e o nome quebrando linha (não `truncate`) dentro da coluna.
 */
describe('texto da pendência', () => {
  it('singular e plural', () => {
    expect(textoDaPendencia('OCCURRENCES', 1)).toBe('1 ocorrência crítica em aberto');
    expect(textoDaPendencia('TASKS', 6)).toBe('6 tarefas com prazo vencido');
    expect(textoDaPendencia('PAYMENTS', 2)).toBe('2 pagamentos esperando a sua aprovação');
    expect(textoDaPendencia('DESCONHECIDA', 4)).toBe('4 pendência(s)');
  });
});

describe('mega menu', () => {
  const src = readFileSync(join(process.cwd(), 'src/components/layout/top-nav.tsx'), 'utf8');
  it('mostra a contagem no ITEM, com a descrição', () => {
    expect(src).toContain('const n = pendencias[item.key] ?? 0;');
    expect(src).toContain('data-testid={`pendencia-${item.key}`}');
    expect(src).toContain('textoDaPendencia(item.key, n)');
  });
  it('nome longo quebra linha dentro da coluna e o painel não sai da tela', () => {
    expect(src).toContain('whitespace-normal break-words');
    expect(src).not.toMatch(/<span className="flex-1 truncate">\{item\.label\}<\/span>/);
    expect(src).toContain("maxWidth: 'calc(100vw - 32px)'");
    expect(src).toContain('window.innerWidth - 16');
  });
});
