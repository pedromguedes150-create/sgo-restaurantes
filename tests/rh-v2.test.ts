import { describe, it, expect } from 'vitest';
import { pathDePingValido, resumirForma } from '@/lib/rh/v2-ping';

/**
 * O ping da v2 pode viver em PRODUÇÃO porque nunca devolve valor do RH — só a
 * forma. Estes testes travam exatamente isso: nomes de campos entram, valores
 * não; e o caminho pedido não sobe diretório nem escapa do prefixo.
 */

describe('resumirForma — descreve sem vazar', () => {
  it('envelope { data: [...] } vira lista com os campos do primeiro item', () => {
    const f = resumirForma({ data: [{ nome: 'Fulano', cpf: '12345678901', status: 'Ativo' }, { nome: 'B' }] });
    expect(f).toEqual({ tipo: 'lista', chaves: ['nome', 'cpf', 'status'], itens: 2 });
    /* Nenhum VALOR aparece em lugar nenhum do resumo. */
    expect(JSON.stringify(f)).not.toContain('Fulano');
    expect(JSON.stringify(f)).not.toContain('12345678901');
  });

  it('lista de topo e lista vazia', () => {
    expect(resumirForma([{ a: 1 }])).toEqual({ tipo: 'lista', chaves: ['a'], itens: 1 });
    expect(resumirForma([])).toEqual({ tipo: 'lista', chaves: [], itens: 0 });
    expect(resumirForma({ data: [] })).toEqual({ tipo: 'lista', chaves: [], itens: 0 });
  });

  it('objeto simples lista as chaves de topo', () => {
    expect(resumirForma({ success: true, total: 3 })).toEqual({ tipo: 'objeto', chaves: ['success', 'total'], itens: null });
  });

  it('null, string e número não estouram', () => {
    expect(resumirForma(null).tipo).toBe('vazio');
    expect(resumirForma('x').tipo).toBe('outro');
    expect(resumirForma(7).tipo).toBe('outro');
  });
});

describe('pathDePingValido — relativo, curto, sem subir diretório', () => {
  it('aceita caminhos normais, com ou sem query', () => {
    for (const p of ['/colaboradores', '/colaboradores/unidades', '/unidade/ABC-1', '/colaboradores?page=2&status=Ativo', '/']) {
      expect(pathDePingValido(p), p).toBe(true);
    }
  });

  it('recusa o que poderia escapar do prefixo ou virar outra coisa', () => {
    for (const p of ['colaboradores', '/../api/ext/colaboradores', '//evil.com/x', 'https://evil.com', '/a b', '/x?y=<script>', '']) {
      expect(pathDePingValido(p), p).toBe(false);
    }
  });
});
