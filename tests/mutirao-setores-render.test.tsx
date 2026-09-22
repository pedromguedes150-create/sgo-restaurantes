import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/configuracoes/produtos',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { MutiraoDeSetores } from '@/components/products/mutirao-de-setores';

/**
 * A TELA DO MUTIRÃO.
 *
 * O risco desta tela é específico: uma coluna de setores já preenchida convida
 * a apertar "aplicar" sem ler, e o engano sai multiplicado por mil. Por isso o
 * que se prova aqui é que ela mostra o PORQUÊ de cada proposta, separa o que
 * não tem proposta, e não promete aplicar o que ninguém escolheu.
 */

const SETORES = [
  { id: 'bebidas', name: 'BEBIDAS' },
  { id: 'bomboniere', name: 'BOMBONIERE DIVERSOS' },
  { id: 'salgados', name: 'SALGADOS' },
  { id: 'descartaveis', name: 'DESCARTÁVEIS' },
];

const ITENS = [
  { id: '1', name: 'Coca-Cola 2L', category: 'Bebidas' },
  { id: '2', name: 'Chiclete Trident Menta', category: 'Diversos' },
  { id: '3', name: 'Coxinha de frango com requeijão', category: 'Diversos' },
  { id: '4', name: 'Forminhas de papel para empadas', category: 'Diversos' },
  { id: '5', name: 'Peça de reposição do fogão', category: 'Diversos' },
];

const semSeparadores = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');

const tela = (props: Partial<React.ComponentProps<typeof MutiraoDeSetores>> = {}) =>
  semSeparadores(renderToString(
    <MutiraoDeSetores itens={ITENS} setores={SETORES} onFechar={() => {}} {...props} />,
  ));

describe('A proposta vem com o porquê', () => {
  const html = tela();

  it('diz qual termo a regra reconheceu, em vez de só preencher o campo', () => {
    /* Sem isso, a pessoa não tem como discordar — teria de adivinhar de onde
       veio o palpite. */
    expect(html).toContain('pela regra — coca cola');
    expect(html).toContain('pela regra — chiclete');
  });

  it('marca em separado o que NÃO tem proposta', () => {
    expect(html).toContain('sem proposta');
  });

  it('conta os dois grupos antes da lista', () => {
    /* 4 dos 5 têm proposta; a peça de reposição não. */
    expect(html).toContain('4</b> com setor proposto');
    expect(html).toContain('1</b> sem proposta');
  });
});

describe('A classificação aparece certa na tela', () => {
  const html = tela();

  it('a coxinha de requeijão é SALGADOS, e não câmara fria', () => {
    /* O caso que o romaneio real ensinou: por comprimento de termo,
       "requeijão" venceria "coxinha". */
    expect(html).toContain('pela regra — coxinha');
  });

  it('a forminha para empada é DESCARTÁVEIS, e não salgado', () => {
    expect(html).toContain('pela regra — forminha');
  });
});

describe('Os dois botões dizem o que vão fazer', () => {
  it('o de aplicar traz a contagem, e o da IA traz quantos sobraram', () => {
    const html = tela();
    expect(html).toContain('Aplicar 4 setor(es)');
    expect(html).toContain('Usar a IA nos 1 sem proposta');
  });

  it('sem nenhum item sem proposta, o botão da IA some', () => {
    const html = tela({ itens: [ITENS[0]] });
    expect(html).not.toContain('Usar a IA');
    expect(html).toContain('Aplicar 1 setor(es)');
  });
});

describe('Cada linha permite discordar', () => {
  it('oferece "Deixar sem setor" — sem setor é melhor que com o errado', () => {
    /* Com o setor errado o item some numa fila que ninguém confere; sem setor
       ele continua aparecendo no aviso âmbar até alguém resolver. */
    expect(tela()).toContain('Deixar sem setor');
  });

  it('o seletor de cada linha tem nome acessível com o produto', () => {
    expect(tela()).toContain('Setor de Coca-Cola 2L');
  });
});

describe('Sem setores cadastrados', () => {
  it('manda cadastrar os setores, em vez de mostrar uma lista inútil', () => {
    /* Sem setor nenhum não há para onde apontar, e uma tabela de selects vazios
       faria a pessoa procurar o defeito no lugar errado. */
    const html = tela({ setores: [] });
    expect(html).toContain('Nenhum setor do CD cadastrado');
    expect(html).not.toContain('Aplicar');
  });
});
