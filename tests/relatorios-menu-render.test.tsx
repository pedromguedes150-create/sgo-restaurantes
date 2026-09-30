import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { RelatoriosMenu } from '@/components/payments/relatorios-menu';

/**
 * O cabeçalho de Pagamentos tinha três botões soltos; agora é um menu. O que
 * se prova: ele nasce FECHADO (só o botão), some quando não há o que mostrar
 * e é um menu de verdade para o leitor de tela.
 */
const itens = [
  { href: '/modulos/pagamentos/relatorio-freelancers', titulo: 'Recorrência de Freelancers', descricao: 'Quem repete na semana.' },
  { href: '/modulos/pessoas/comissoes', titulo: 'Pagamento Extra', descricao: 'Horas extras por competência.' },
];

describe('Menu de relatórios de Pagamentos', () => {
  it('nasce fechado: só o botão, com aria-haspopup', () => {
    const h = renderToString(<RelatoriosMenu itens={itens} />);
    /* Não é só "Relatórios": a barra de navegação já tem uma área com esse nome. */
    expect(h).toContain('Relatórios de Pagamentos');
    expect(h).toContain('aria-haspopup="menu"');
    expect(h).toContain('aria-expanded="false"');
    expect(h).not.toContain('Recorrência de Freelancers');
  });

  it('sem itens (perfil sem nenhum relatório) não renderiza nada', () => {
    expect(renderToString(<RelatoriosMenu itens={[]} />)).toBe('');
  });
});
