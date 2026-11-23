import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/modulos/inventario-utensilios',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { ContagemClient } from '@/components/utensilios/contagem-client';
import { AuditoriaClient } from '@/components/utensilios/auditoria-client';
import { CatalogoUtensiliosClient } from '@/components/utensilios/catalogo-client';

/** INVENTÁRIO DE UTENSÍLIOS (v1.177.0) — o que as telas prometem. */

const itens = [
  { id: 'a', name: 'Pratos — Cliente', quantity: 120, custom: false, note: null },
  { id: 'b', name: 'Copos — 300 ml', quantity: 0, custom: false, note: null },
  { id: 'c', name: 'Facas', quantity: null, custom: false, note: null },
  { id: 'd', name: 'Travessas', quantity: 4, custom: true, note: 'inox' },
];

describe('Contagem (gerente)', () => {
  it('um utensílio por linha, vazio marcado como "Não conferido" (zero não), total só do informado, botão de adicionar e os dois botões', () => {
    const html = renderToString(React.createElement(ContagemClient, {
      inventario: { id: 'i1', unidade: 'Beija Flor Centro', status: 'RASCUNHO', managerId: 'g1', notes: null, returnReason: null, items: itens },
      responsaveis: [{ id: 'g1', name: 'Gerente Um' }],
    })).split('<!-- -->').join('');
    expect(html).toContain('data-testid="contagem-utensilios"');
    expect((html.match(/data-testid="item-padrao"/g) ?? []).length).toBe(3);
    expect((html.match(/data-testid="item-extra"/g) ?? []).length).toBe(1);
    expect((html.match(/Não conferido/g) ?? []).length).toBe(1); // só as Facas; Copos = 0 é conferido
    expect(html).toContain('Total: <b class="tabular-nums text-ink-900">124</b>');
    expect(html).toContain('Adicionar outro utensílio');
    expect(html).toContain('Salvar rascunho');
    expect(html).toContain('Enviar inventário');
    expect(html).toContain('1 item(ns) sem quantidade.');
    expect(html).toContain('inputMode="numeric"');
  });
  it('devolvido mostra o motivo e o botão vira "Reenviar"', () => {
    const html = renderToString(React.createElement(ContagemClient, {
      inventario: { id: 'i1', unidade: 'Centro', status: 'EM_CORRECAO', managerId: 'g1', notes: null, returnReason: 'Faltou contar as cubas da cozinha', items: itens },
      responsaveis: [{ id: 'g1', name: 'Gerente Um' }],
    }));
    expect(html).toContain('Devolvido para correção');
    expect(html).toContain('Faltou contar as cubas da cozinha');
    expect(html).toContain('Reenviar inventário');
  });
});

describe('Auditoria (supervisor/coordenador)', () => {
  it('tabela Informado × Conferido × Diferença, conferência opcional, Aprovar e Devolver', () => {
    const html = renderToString(React.createElement(AuditoriaClient, {
      inventarioId: 'i1', observacaoAtual: null,
      itens: itens.map((i) => ({ ...i, auditedQuantity: i.id === 'a' ? 118 : null })),
    })).split('<!-- -->').join('');
    expect(html).toContain('data-testid="auditoria-utensilios"');
    expect(html).toContain('é opcional: preencha só se você contou');
    expect(html).toContain('>-2<');
    expect(html).toContain('1 item(ns) com diferença');
    expect(html).toContain('Aprovar inventário');
    expect(html).toContain('Devolver para correção');
    expect(html).toContain('Registrar conferência');
  });
  it('fonte: o motivo da devolução é obrigatório e o botão fica travado até ter o mínimo', () => {
    const src = readFileSync('src/components/utensilios/auditoria-client.tsx', 'utf8');
    expect(src).toContain('disabled={motivo.trim().length < MOTIVO_MIN}');
    expect(src).toContain("acao: 'devolver', id: inventarioId, motivo");
  });
});

describe('Configurações → Utensílios', () => {
  it('lista numerada com ativo/inativo; o Admin renomeia, ordena, (des)ativa e adiciona', () => {
    const html = renderToString(React.createElement(CatalogoUtensiliosClient, {
      itens: [{ id: '1', name: 'Pratos — Cliente', order: 1, active: true }, { id: '2', name: 'Cubas', order: 2, active: false }], podeEditar: true,
    }));
    expect(html).toContain('data-testid="catalogo-utensilios"');
    expect(html).toContain('Pratos — Cliente');
    expect(html).toContain('Inativo');
    expect(html).toContain('Desativar');
    expect(html).toContain('>Ativar<');
    expect(html).toContain('Novo utensílio');
    expect(html).toContain('Renomear não reescreve o histórico');
  });
  it('sem permissão, só lê', () => {
    const html = renderToString(React.createElement(CatalogoUtensiliosClient, { itens: [{ id: '1', name: 'Pratos', order: 1, active: true }], podeEditar: false }));
    expect(html).not.toContain('Desativar');
    expect(html).not.toContain('Novo utensílio');
  });
});

describe('v1.219.0 — Evolução e nova contagem por local', () => {
  it('a Evolução mostra quebras, sobras, "maior/menor" e a relação por utensílio; local com uma contagem só avisa', async () => {
    const { EvolucaoDosUtensilios } = await import('@/components/utensilios/evolucao');
    const { seriesPorLocal } = await import('@/lib/utensilios/evolucao');
    const c = (id: string, local: string, dia: string, itens: [string, number][]) => ({ id, unitId: 'u1', unidade: 'Jardim', local, quando: new Date(`${dia}T12:00:00Z`), managerName: 'Geovana', itens: itens.map(([name, quantity]) => ({ name, quantity })) });
    const series = seriesPorLocal([
      c('a', 'Restaurante', '2026-09-20', [['Pratos', 100]]), c('b', 'Restaurante', '2026-10-20', [['Pratos', 95]]), c('d', 'Restaurante', '2026-11-20', [['Pratos', 80]]),
      c('l', 'Lanchonete', '2026-11-20', [['Copos', 30]]),
    ]);
    const html = renderToString(React.createElement(EvolucaoDosUtensilios, { series, mostrarUnidade: false })).split('<!-- -->').join('');
    expect(html).toContain('data-local="Restaurante"');
    expect(html).toContain('data-local="Lanchonete"');
    expect(html).toContain('maior que na comparação anterior (5 quebras)');
    expect(html).toContain('primeira contagem deste local');
    expect(html).toContain('Aparece a partir da segunda contagem deste local.');
    expect(html).toContain('-15');
  });
  it('a nova contagem oferece o local e "Outro local…"', async () => {
    const { NovaContagem } = await import('@/components/utensilios/abrir-contagem');
    const html = renderToString(React.createElement(NovaContagem, { unitId: 'u1', locais: ['Lanchonete'] }));
    expect(html).toContain('Local da nova contagem');
    expect(html).toContain('Iniciar contagem');
  });
});

describe('fonte: regras que a tela não pode afrouxar', () => {
  it('o menu mostra o Inventário de Utensílios ao lado do Teknisa, e o antigo saiu do padrão do gerente', () => {
    const areas = readFileSync('src/lib/nav/areas.ts', 'utf8');
    expect(areas).toContain("'UTENSILS', 'INVENTORY'");
    const perms = readFileSync('src/lib/permissions.ts', 'utf8');
    expect(perms).toContain("UTENSILS: ['MANAGER', 'COORDINATOR', 'SUPERVISOR']");
    expect(perms).toContain("INVENTORY: ['SUPERVISOR', 'COORDINATOR']");
  });
  it('a meta lê a cobertura de utensílios com peso próprio (nasce em 0)', () => {
    const comp = readFileSync('src/lib/metas/componentes.ts', 'utf8');
    expect(comp).toContain("comp('UTENSILS', ");
    /* v1.180.0: o peso vive no registro das chaves (vigência por mês) e o getter lê por mês */
    const regras = readFileSync('src/lib/metas/vigencia-regras.ts', 'utf8');
    expect(regras).toContain("{ key: 'UTENSILS', name: 'Inventário de utensílios (enviado no mês)', pesoPadrao: 0 }");
    const cfg = readFileSync('src/lib/metas/config.ts', 'utf8');
    expect(cfg).toContain("readWeight('UTENSILS', ym)");
  });
});
