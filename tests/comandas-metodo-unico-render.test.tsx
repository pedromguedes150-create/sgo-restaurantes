import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/comandas',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { IniciarConferencia } from '@/components/commands/iniciar-conferencia';
import { METODO_LABEL, METODO_UNICO } from '@/lib/commands/sessao';

/**
 * CONFERÊNCIA DE COMANDAS, v1.192.0 (decisão do Pedro, 06/11): UM método
 * (Leitor + Manual) e um cancelamento que não trava.
 */
describe('um método só', () => {
  it('o início não pergunta mais o método: o cliente manda MISTO e o servidor só conhece esse', () => {
    const src = readFileSync('src/components/commands/iniciar-conferencia.tsx', 'utf8');
    expect(src).not.toContain("'METODO'");
    expect(src).not.toContain("v: 'MANUAL'");
    expect(src).not.toContain("v: 'LEITOR'");
    expect(src).toContain("method: 'MISTO'");
    expect(METODO_UNICO).toBe('MISTO');
    expect(METODO_LABEL.MISTO).toBe('Leitor + Manual');
    const html = renderToString(React.createElement(IniciarConferencia, { unitId: 'u1', ultima: null, emAndamento: null, faixaDoDia: [1, 2, 3] }));
    expect(html).toContain('Iniciar nova conferência');
    expect(html).not.toContain('Como deseja realizar');
  });
});

describe('cancelar sem o leitor roubar o foco', () => {
  it('o Cancelar abre uma janela própria (sem confirm() nativo) e, com ela aberta, o leitor fica DESLIGADO na mesma condição do finalizar', () => {
    const src = readFileSync('src/components/commands/sessao-client.tsx', 'utf8');
    /* o confirm() só sobrevive no comentário que conta a história — o código não o chama */
    const codigo = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    expect(codigo).not.toMatch(/\bconfirm\(/);
    expect(src).toContain('const leitorAtivo = usaLeitor && podeEditar && !fechando && !cancelando;');
    expect(src).toContain('data-testid="abrir-cancelar"');
    expect(src).toContain('data-testid="confirmar-cancelar"');
    /* a resposta do servidor é lida: recusa vira mensagem, não silêncio */
    expect(src).toMatch(/setErro\(d\.error \?\? 'Não foi possível cancelar\.'\)/);
  });
});
