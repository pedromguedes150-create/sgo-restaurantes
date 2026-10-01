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
 * O que a tela PROMETE: o catálogo não despeja ingredientes; a ficha mostra
 * tabela + foto + navegação; o Admin tem as ações e os outros não; a prévia
 * da importação marca "Revisar informação" só no que a IA não leu.
 */

const resumo = (over: Partial<React.ComponentProps<typeof CatalogoClient>['fichas'][number]> = {}) => ({
  id: 'f1', name: 'Pão c/ Linguiça Completo', code: '910000000501', category: 'Pão Francês',
  imagePath: 'uploads/preparo/foto-1.jpg', status: 'ACTIVE' as const, ingredientes: ['Pão Francês', 'Linguiça', 'Queijo Minas'],
  updatedAt: '2026-10-01T10:00:00.000Z', ...over,
});

const completa = (): React.ComponentProps<typeof FichaClient>['ficha'] => ({
  id: 'f1', name: 'Pão c/ Linguiça Completo', code: '910000000501', category: 'Pão Francês',
  preparationMethod: 'Montar na ordem.', generalNotes: null,
  items: [
    { ingredientName: 'Pão Francês', quantity: 1, unit: 'Unid', weightGrams: 65, notes: null },
    { ingredientName: 'Linguiça', quantity: 2, unit: 'fatias', weightGrams: 120, notes: 'Fatia na largura da espátula' },
    { ingredientName: 'Saco para Lanche', quantity: 1, unit: 'Unid', weightGrams: null, notes: null },
  ],
  imagePath: 'uploads/preparo/foto-1.jpg', status: 'ACTIVE', sourceFilePath: null,
  createdByName: 'Daniel', updatedByName: null, createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z',
});

const limpa = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');

describe('Catálogo', () => {
  it('card compacto: foto, nome, categoria, código e "Ver padrão" — SEM os ingredientes', () => {
    const html = limpa(renderToString(React.createElement(CatalogoClient, { fichas: [resumo()], categorias: ['Pão Francês'], isAdmin: false, status: 'ACTIVE' })));
    expect(html).toContain('Pão c/ Linguiça Completo');
    expect(html).toContain('Pão Francês');
    expect(html).toContain('Código 910000000501');
    expect(html).toContain('Ver padrão');
    expect(html).toContain('/uploads/preparo/foto-1.jpg');
    expect(html).toContain('href="/modulos/padronizacao/f1"');
    expect(html).not.toContain('Queijo Minas');
    expect(html).toContain('Buscar produto, código ou ingrediente');
  });

  it('Importar ficha / Nova ficha / Situação só para o Admin', () => {
    const props = { fichas: [resumo()], categorias: [], status: 'ACTIVE' as const };
    const func = renderToString(React.createElement(CatalogoClient, { ...props, isAdmin: false }));
    expect(func).not.toContain('Importar ficha');
    expect(func).not.toContain('Nova ficha');
    expect(func).not.toContain('aria-label="Situação"');
    const adm = renderToString(React.createElement(CatalogoClient, { ...props, isAdmin: true }));
    expect(adm).toContain('Importar ficha');
    expect(adm).toContain('Nova ficha');
    expect(adm).toContain('aria-label="Situação"');
  });

  it('vazio diz o que fazer, conforme o perfil', () => {
    const adm = renderToString(React.createElement(CatalogoClient, { fichas: [], categorias: [], isAdmin: true, status: 'ACTIVE' }));
    expect(adm).toContain('Importe a primeira ficha');
    const func = renderToString(React.createElement(CatalogoClient, { fichas: [], categorias: [], isAdmin: false, status: 'ACTIVE' }));
    expect(func).toContain('quando o Administrador publicar');
  });
});

describe('Ficha', () => {
  const props = () => ({ ficha: completa(), vizinhos: { prevId: 'f0', nextId: 'f2', posicao: 3, total: 42 }, historico: [], categorias: [] });

  it('tabela de ingredientes (quantidade, peso, observação), foto em destaque, navegação e "Voltar"', () => {
    const html = limpa(renderToString(React.createElement(FichaClient, { ...props(), isAdmin: false })));
    expect(html).toContain('Linguiça');
    expect(html).toContain('2 fatias');
    expect(html).toContain('120');
    expect(html).toContain('Fatia na largura da espátula');
    expect(html).toContain('Foto de referência: Pão c/ Linguiça Completo');
    expect(html).toContain('Voltar para Padronização');
    expect(html).toContain('href="/modulos/padronizacao/f0"');
    expect(html).toContain('href="/modulos/padronizacao/f2"');
    expect(html).toContain('3 de 42');
    expect(html).toContain('Código: ');
    expect(html).toContain('910000000501');
  });

  it('as ações do Admin e o histórico NÃO aparecem para quem não é Admin; aparecem para o Admin', () => {
    const func = renderToString(React.createElement(FichaClient, { ...props(), isAdmin: false }));
    for (const t of ['Editar ficha', 'Alterar foto', 'Desativar', 'Histórico de alterações']) expect(func).not.toContain(t);
    const adm = renderToString(React.createElement(FichaClient, { ...props(), isAdmin: true, historico: [{ id: 'h1', userName: 'Daniel', field: 'Linguiça · Peso', oldValue: '120 g', newValue: '110 g', createdAt: '2026-09-30T14:32:00.000Z' }] }));
    for (const t of ['Editar ficha', 'Alterar foto', 'Desativar', 'Histórico de alterações']) expect(adm).toContain(t);
    expect(limpa(adm)).toContain('Linguiça · Peso: 120 g → 110 g');
  });

  it('sem foto, diz "Sem foto de referência" em vez de deixar um buraco; inativa ganha o crachá', () => {
    const html = renderToString(React.createElement(FichaClient, { ...props(), isAdmin: true, ficha: { ...completa(), imagePath: null, status: 'INACTIVE' } }));
    expect(html).toContain('Sem foto de referência');
    expect(html).toContain('Inativa');
    expect(html).toContain('Reativar');
  });
});

describe('Editor (prévia da importação)', () => {
  it('"Revisar informação" aparece SÓ nos campos que a IA não leu com segurança', () => {
    const valor = paraEditavel({
      name: 'Pão c/ Linguiça Completo', code: '', category: 'Lanches', preparationMethod: null, generalNotes: null,
      items: [{ ingredientName: 'Linguiça', quantity: 2, unit: 'fatias', weightGrams: null, notes: null }],
    });
    const html = renderToString(React.createElement(EditorFicha, { valor, onChange: () => {}, revisar: ['code', 'items.0.weightGrams'], categorias: ['Lanches'] }));
    expect(html.match(/Revisar informação/g)?.length).toBe(2);
    expect(html).toContain('Adicionar ingrediente');
    expect(html).toContain('Mover para cima');
    expect(html).toContain('Remover ingrediente');
  });
});
