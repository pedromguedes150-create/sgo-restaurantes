import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/estoque',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { EstoqueClient, type EstoqueUI, type LinhaUI } from '@/components/stock/estoque-client';

/**
 * A TELA do estoque.
 *
 * O que se prova aqui é o que a tela PROMETE ao gerente, e que nenhum teste de
 * servidor alcança: que a pendência de validade aparece com a pergunta e as
 * quatro saídas, que a quantidade é lida nas duas grandezas, e que o rótulo da
 * faixa não é um código interno.
 */

function linha(over: Partial<LinhaUI> = {}): LinhaUI {
  return {
    lotId: 'l1', produto: 'Molho X', categoria: 'Mercearia',
    lotCode: '4587', expiresAt: '2026-10-01',
    unidades: 20, quantidade: '20 un', qtyReceived: 20,
    faixa: { chave: 'ATENCAO', rotulo: 'Atenção — vence em 5 dias', tom: 'warning', dias: 5 },
    pendente: false,
    ...over,
  };
}

function estoque(over: Partial<EstoqueUI> = {}): EstoqueUI {
  const linhas = over.linhas ?? [linha()];
  return {
    hoje: '2026-09-22',
    linhas,
    pendencias: over.pendencias ?? linhas.filter((l) => l.pendente),
    contagens: { total: 20, lotes: linhas.length, vencidos: 0, criticos: 0, atencao: 1, proximos: 0, ...over.contagens },
    ...over,
  };
}

/**
 * `renderToString` separa trechos de texto vizinhos com comentários HTML, então
 * "Recebido: {n} un" não sai do render como uma string contínua. Tirá-los é o
 * que permite afirmar a FRASE que o gerente lê, em vez do HTML que o React
 * escreveu para remontá-la no cliente.
 */
const semSeparadores = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');

const tela = (props: Partial<React.ComponentProps<typeof EstoqueClient>> = {}) =>
  renderToString(
    <EstoqueClient
      podeLancar
      units={[{ id: 'u1', name: 'Beija Flor Centro' }]}
      unitId="u1"
      estoque={estoque()}
      {...props}
    />,
  );

describe('A pendência de validade abre primeiro', () => {
  it('quem tem lote a responder cai direto na aba Validade', () => {
    /* Pendência é trabalho parado. Abrir na bipagem obrigaria o gerente a
       descobrir sozinho que havia algo esperando por ele. */
    const html = tela({ estoque: estoque({ linhas: [linha({ pendente: true })] }) });
    expect(html).toContain('Precisam da sua resposta');
    expect(html).toContain('Validade (1)');
  });

  it('sem pendência, abre na bipagem — que é a rotina', () => {
    const html = tela();
    expect(html).toContain('Bipe ou digite e tecle Enter');
  });

  it('quem não pode lançar não vê a aba Bipar', () => {
    const html = tela({ podeLancar: false });
    expect(html).not.toContain('Bipe ou digite e tecle Enter');
    expect(html).toContain('Estoque (1)');
  });
});

describe('O cartão da tratativa', () => {
  const html = () => tela({ estoque: estoque({ linhas: [linha({ pendente: true })] }) });

  it('oferece as QUATRO saídas', () => {
    const h = html();
    for (const rotulo of ['Lote finalizado', 'Ainda possui estoque', 'Descarte / perda', 'Transferido']) {
      expect(h).toContain(rotulo);
    }
  });

  it('mostra o recebido ao lado do saldo — é a referência da pergunta', () => {
    const h = semSeparadores(html());
    expect(h).toContain('Recebido: 20 un');
    expect(h).toContain('saldo declarado');
  });

  it('identifica o lote e a validade, não só o produto', () => {
    /* Sem o lote, o gerente não sabe QUAL pilha da prateleira responder: o mesmo
       produto tem lotes com validades diferentes. */
    const h = html();
    expect(h).toContain('Lote 4587');
    expect(h).toContain('01/10/2026');
  });

  it('explica POR QUE a pergunta existe', () => {
    /* Sem a explicação, a tela parece cobrar digitação de saída — exatamente o
       que o módulo foi desenhado para não fazer. */
    expect(html()).toContain('não há PDV integrado');
  });
});

describe('A faixa fala português', () => {
  it('"Vence amanhã", e não "CRITICO"', () => {
    const h = tela({
      estoque: estoque({ linhas: [linha({ faixa: { chave: 'CRITICO', rotulo: 'Vence amanhã', tom: 'danger', dias: 1 }, pendente: true })] }),
    });
    expect(h).toContain('Vence amanhã');
    expect(h).not.toContain('>CRITICO<');
  });

  it('vencido aparece encurtado na lista, e por extenso na tratativa', () => {
    /* Na lista o crachá é estreito; "Produto vencido há 3 dias — requer
       tratativa" ali quebraria a linha em qualquer celular. */
    const vencido = linha({
      pendente: true,
      faixa: { chave: 'VENCIDO', rotulo: 'Produto vencido há 3 dias — requer tratativa', tom: 'danger', dias: -3 },
    });
    const h = tela({ estoque: estoque({ linhas: [vencido] }) });
    expect(h).toContain('Vencido');
  });
});

describe('A quantidade é lida nas duas grandezas', () => {
  it('mostra fardos e unidades, como o gerente conta e como o sistema guarda', () => {
    const h = tela({ estoque: estoque({ linhas: [linha({ pendente: true, quantidade: '5 fardos · 60 un', unidades: 60 })] }) });
    expect(semSeparadores(h)).toContain('5 fardos · 60 un');
  });
});

describe('Estoque vazio', () => {
  it('diz o que fazer, em vez de mostrar uma lista em branco', () => {
    const h = tela({ podeLancar: false, estoque: estoque({ linhas: [], contagens: { total: 0, lotes: 0, vencidos: 0, criticos: 0, atencao: 0, proximos: 0 } }) });
    expect(h).toContain('Nenhum lote em estoque');
  });
});

describe('Etapa 2 — transferência e o gancho com o pedido', () => {
  const destinos = [{ id: 'u2', name: 'Beija Flor Orla' }];

  it('com outra unidade ativa, a linha do lote oferece "Transferir"; sem destino, não', () => {
    /* Com pendência a tela abre na aba Validade, que lista os lotes em alerta
       com a mesma linha da Prateleira — é onde o botão fica visível no SSR. */
    const com = tela({ unidadesDestino: destinos, estoque: estoque({ linhas: [linha({ pendente: true })] }) });
    expect(com).toContain('aria-label="Transferir Molho X"');
    const sem = tela({ unidadesDestino: [], estoque: estoque({ linhas: [linha({ pendente: true })] }) });
    expect(sem).not.toContain('aria-label="Transferir');
  });

  it('quem não lança não transfere', () => {
    const h = tela({ podeLancar: false, unidadesDestino: destinos });
    expect(h).not.toContain('aria-label="Transferir');
  });

  it('a cobrança dos recebimentos não lançados aparece com o número do pedido e o link', () => {
    const h = semSeparadores(tela({ recebimentosPendentes: [{ requestId: 'r9', rotulo: 'PED-2026-000042', recebidoEm: '22/09/2026', itensPendentes: 3 }] }));
    expect(h).toContain('1 recebimento(s) da Fábrica/CD ainda não lançado(s)');
    expect(h).toContain('PED-2026-000042');
    expect(h).toContain('3 item(ns) a lançar');
    expect(h).toContain('/modulos/produtos/pedido/r9');
  });

  it('a tratativa "Transferido" fica desabilitada quando não há outra unidade para receber', () => {
    const h = tela({ unidadesDestino: [], estoque: estoque({ linhas: [linha({ pendente: true })] }) });
    expect(h).toContain('Não há outra unidade ativa para receber');
  });
});
