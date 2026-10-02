import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { RelatoriosMenu } from '@/components/payments/relatorios-menu';

/**
 * O cabeçalho de Pagamentos tinha três botões soltos, com aparência solta e
 * poluída; uma primeira correção os escondeu atrás de um menu suspenso, mas
 * isso trocou a LÓGICA de navegação (um clique a mais para um link de uso
 * semanal) — não era o pedido, que era só organizar a aparência. Agora os
 * três continuam visíveis e clicáveis de cara, só reunidos numa tira só.
 */
const itens = [
  { href: '/modulos/pagamentos/relatorio-freelancers', titulo: 'Recorrência de Freelancers', descricao: 'Quem repete na semana.' },
  { href: '/modulos/hora-extra', titulo: 'Pagamento Extra', descricao: 'Horas extras por competência.' },
];

describe('Relatórios de Pagamentos: visíveis de cara, não atrás de um menu', () => {
  it('cada link já está na tela — nenhum clique extra para descobrir que existem', () => {
    const h = renderToString(<RelatoriosMenu itens={itens} />);
    expect(h).toContain('Recorrência de Freelancers');
    expect(h).toContain('Pagamento Extra');
    expect(h).toContain('href="/modulos/pagamentos/relatorio-freelancers"');
    expect(h).toContain('href="/modulos/hora-extra"');
  });

  it('não há mais menu suspenso — sem aria-haspopup/aria-expanded escondendo conteúdo', () => {
    const h = renderToString(<RelatoriosMenu itens={itens} />);
    expect(h).not.toContain('aria-haspopup');
    expect(h).not.toContain('aria-expanded');
  });

  it('a explicação de cada um vira tooltip nativo (title), não texto escondido atrás de clique', () => {
    const h = renderToString(<RelatoriosMenu itens={itens} />);
    expect(h).toContain('title="Quem repete na semana."');
  });

  it('sem itens (perfil sem nenhum relatório) não renderiza nada', () => {
    expect(renderToString(<RelatoriosMenu itens={[]} />)).toBe('');
  });
});
