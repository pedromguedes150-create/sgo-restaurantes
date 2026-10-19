import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/padronizacao',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { CatalogoClient } from '@/components/preparo/catalogo-client';
import { FichaClient } from '@/components/preparo/ficha-client';
import { EditorFicha, paraEditavel } from '@/components/preparo/editor-ficha';

/**
 * A aba RESTAURANTE na tela (v1.172.0): o cartão lê rápido (função ·
 * temperatura · tempo, nº de preparações, "Guia em PDF" quando não há capa);
 * o guia aberto mostra os três fatos, o ARQUIVO embutido, as preparações e a
 * observação — e nada de código nem tabela de ingredientes; o editor do guia
 * pede preparações, não ingredientes.
 */

const limpa = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');

const resumo = (over: Partial<React.ComponentProps<typeof CatalogoClient>['fichas'][number]> = {}) => ({
  id: 'g1', name: 'Cubas Prontas', code: '', category: 'Padronização de preparações',
  imagePath: null, status: 'ACTIVE' as const, ingredientes: ['Escondidinho', 'Lasanha'],
  segment: 'RESTAURANTE' as const, ovenMode: 'Ar Seco', temperature: '200°C', cookTime: '15 Min', sourceFilePath: 'uploads/preparo/fonte-cubas.pdf',
  updatedAt: '2026-10-19T10:00:00.000Z', ...over,
});

const guia = (): React.ComponentProps<typeof FichaClient>['ficha'] => ({
  id: 'g1', name: 'Cubas Prontas', code: '', category: 'Padronização de preparações',
  preparationMethod: null, generalNotes: 'Aquecer o forno antes.',
  segment: 'RESTAURANTE', ovenMode: 'Ar Seco', temperature: '200°C', cookTime: '15 Min',
  items: [
    { ingredientName: 'Escondidinho', quantity: null, unit: null, weightGrams: null, notes: null },
    { ingredientName: 'Lasanha', quantity: null, unit: null, weightGrams: null, notes: null },
  ],
  imagePath: null, status: 'ACTIVE', sourceFilePath: 'uploads/preparo/fonte-cubas.pdf',
  createdByName: 'Daniel', updatedByName: null, createdAt: '2026-10-19T10:00:00.000Z', updatedAt: '2026-10-19T10:00:00.000Z',
});

describe('Catálogo — aba Restaurante', () => {
  it('cartão do guia: leitura rápida, nº de preparações, "Guia em PDF" sem capa, "Abrir guia"; sem a linha de código', () => {
    const html = limpa(renderToString(React.createElement(CatalogoClient, { fichas: [resumo()], categorias: [], isAdmin: false, status: 'ACTIVE', segment: 'RESTAURANTE' })));
    expect(html).toContain('Ar Seco · 200°C · 15 Min');
    expect(html).toContain('2 preparação(ões)');
    expect(html).toContain('Guia em PDF');
    expect(html).toContain('Abrir guia');
    expect(html).not.toContain('Código ');
    expect(html).toContain('Buscar guia ou preparação');
  });

  it('guia com foto-fonte (não PDF) usa o próprio arquivo como capa, leve (?w=320); com capa própria, a capa vence', () => {
    const foto = limpa(renderToString(React.createElement(CatalogoClient, { fichas: [resumo({ sourceFilePath: 'uploads/preparo/fonte-cubas.jpg' })], categorias: [], isAdmin: false, status: 'ACTIVE', segment: 'RESTAURANTE' })));
    expect(foto).toContain('/uploads/preparo/fonte-cubas.jpg?w=320');
    const capa = limpa(renderToString(React.createElement(CatalogoClient, { fichas: [resumo({ imagePath: 'uploads/preparo/capa.jpg' })], categorias: [], isAdmin: false, status: 'ACTIVE', segment: 'RESTAURANTE' })));
    expect(capa).toContain('/uploads/preparo/capa.jpg?w=320');
    expect(capa).not.toContain('Guia em PDF');
  });

  it('o Admin vê "Importar guia" e "Novo guia"; o vazio explica o guia', () => {
    const adm = renderToString(React.createElement(CatalogoClient, { fichas: [], categorias: [], isAdmin: true, status: 'ACTIVE', segment: 'RESTAURANTE' }));
    expect(adm).toContain('Importar guia');
    expect(adm).toContain('Novo guia');
    expect(adm).toContain('Nenhum guia publicado ainda');
  });
});

describe('Guia aberto', () => {
  const props = () => ({ ficha: guia(), vizinhos: { prevId: 'g0', nextId: 'g2', posicao: 1, total: 3 }, historico: [], categorias: [] });

  it('três fatos, PDF embutido, "Abrir arquivo", preparações e observação; sem "Código:" nem tabela de ingredientes; Voltar cai na aba Restaurante', () => {
    const html = limpa(renderToString(React.createElement(FichaClient, { ...props(), isAdmin: false })));
    expect(html).toContain('data-testid="guia-restaurante"');
    for (const t of ['Função', 'Ar Seco', 'Temperatura', '200°C', 'Tempo', '15 Min']) expect(html).toContain(t);
    expect(html).toContain('<iframe');
    expect(html).toContain('/uploads/preparo/fonte-cubas.pdf');
    expect(html).toContain('Abrir arquivo');
    expect(html).toContain('Escondidinho');
    expect(html).toContain('Lasanha');
    expect(html).toContain('Aquecer o forno antes.');
    expect(html).not.toContain('Código:');
    expect(html).not.toContain('Peso (g)');
    expect(html).toContain('href="/modulos/padronizacao?aba=restaurante"');
  });

  it('guia cuja fonte é FOTO mostra a imagem em tamanho de tela (?w=1600); fato ausente aparece como traço', () => {
    const html = limpa(renderToString(React.createElement(FichaClient, { ...props(), isAdmin: true, ficha: { ...guia(), sourceFilePath: 'uploads/preparo/fonte-cubas.jpg', cookTime: null } })));
    expect(html).toContain('/uploads/preparo/fonte-cubas.jpg?w=1600');
    expect(html).not.toContain('<iframe');
    expect(html).toContain('—');
    expect(html).toContain('Editar guia');
    expect(html).toContain('Alterar capa');
  });
});

describe('Editor do guia', () => {
  it('pede nome do guia, forno (função/temperatura/tempo), PREPARAÇÕES e observação — sem código, sem pesos, sem modo de preparo', () => {
    const valor = paraEditavel(guia());
    const html = renderToString(React.createElement(EditorFicha, { valor, onChange: () => {}, revisar: ['temperature'], categorias: [] }));
    expect(html).toContain('Nome do guia');
    expect(html).toContain('Adicionar preparação');
    expect(html).toContain('Remover preparação');
    expect(html).toContain('Ex.: Ar Seco');
    expect(html).not.toContain('Adicionar ingrediente');
    expect(html).not.toContain('Modo de preparo');
    expect(html).not.toContain('Peso (g)');
    expect(html).not.toContain('Como está no Teknisa');
    expect(html.match(/Revisar informação/g)?.length).toBe(1);
  });

  it('paraEditavel(null, "RESTAURANTE") nasce na aba certa; a ficha da lanchonete segue com o editor de sempre', () => {
    expect(paraEditavel(null, 'RESTAURANTE').segment).toBe('RESTAURANTE');
    const lanch = paraEditavel({ name: 'Pão', code: '1', category: 'Lanches', preparationMethod: null, generalNotes: null, items: [] });
    expect(lanch.segment).toBe('LANCHONETE');
    const html = renderToString(React.createElement(EditorFicha, { valor: lanch, onChange: () => {}, categorias: [] }));
    expect(html).toContain('Adicionar ingrediente');
    expect(html).toContain('Como está no Teknisa');
  });
});
