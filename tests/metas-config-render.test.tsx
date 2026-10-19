import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/configuracoes/checklists',
}));

import { renderToString } from 'react-dom/server';
import React from 'react';
import { TemplatesAdmin } from '@/components/admin/templates-admin';
import { ChecklistModelsAdmin } from '@/components/admin/checklist-models-admin';
import { MetaPorModuloClient } from '@/components/metas/meta-por-modulo-client';
import { RoscaDaComposicao } from '@/components/metas/graficos-metas';
import { comporMeta } from '@/lib/metas/graficos';
import { linhasPorModulo } from '@/lib/metas/por-modulo';
import { MODULES } from '@/lib/permissions';
import { AREAS } from '@/lib/nav/areas';

/**
 * META v1.174.0 — o que as TELAS prometem: o peso por checklist saiu de
 * Configurações → Checklists (fica só "Entra na meta"); a Configuração da Meta
 * tem UMA tela, por módulo, com o peso dos checklists editável; o
 * detalhamento mostra cada checklist como informação, sem peso próprio.
 */

describe('Configurações → Checklists sem peso por checklist', () => {
  it('a lista não fala mais em "peso" nem em "Soma dos pesos", e aponta para a Configuração da Meta', () => {
    const html = renderToString(React.createElement(TemplatesAdmin, {
      units: [{ id: 'u1', name: 'Centro' }],
      templates: [{ id: 't1', unitId: 'u1', name: 'Abertura', limitTime: '11:00', weight: 20, scope: 'UNIT', requiresEvidence: false, entersMeta: true, active: true, startDate: null, endDate: null, groupUnitIds: ['u1'], items: [] }],
      examples: [{ id: 'e1', name: 'Fechamento', category: null, moment: null, scope: 'UNIT', limitTime: null, requiresEvidence: false, weight: 20, itemCount: 3 }],
    }));
    expect(html).not.toContain('Soma dos pesos');
    expect(html).not.toMatch(/peso \d/);
    expect(html).toContain('Metas → Configuração da Meta');
    expect(html).toContain('· meta'); // o selo "entra na meta" continua
  });

  it('o formulário de checklist e o de modelo não têm mais o campo "Peso na meta" (fonte); "Entra na meta" fica', () => {
    const tpl = readFileSync('src/components/admin/templates-admin.tsx', 'utf8');
    const mod = readFileSync('src/components/admin/checklist-models-admin.tsx', 'utf8');
    expect(tpl).not.toContain('Peso na meta');
    expect(mod).not.toContain('Peso na meta');
    expect(tpl).toContain('Entra na meta');
    /* o formulário não manda `weight` — o servidor fica com o padrão, que ninguém lê mais para a meta */
    expect(tpl).not.toMatch(/weight: Number\(weight\)/);
    expect(mod).not.toMatch(/weight: Number\(weight\)/);
  });

  it('a lista de modelos também não mostra peso', () => {
    const html = renderToString(React.createElement(ChecklistModelsAdmin, {
      models: [{ id: 'm1', name: 'Cozinha — Abertura', category: 'Cozinha', moment: 'Abertura', scope: 'UNIT', limitTime: null, weight: 10, requiresEvidence: false, active: true, builtin: true, items: [] }],
    }));
    expect(html).not.toMatch(/peso \d/);
    expect(html).toContain('da unidade');
  });
});

describe('Configuração da Meta — uma tela, por módulo', () => {
  const grupos = linhasPorModulo(MODULES, AREAS, { tasksMeta: 100, wasteMeta: 0, commandsMeta: 0, communication: 0, training: 0, evaluation: 0, lateEntry: 2, managerLeaveMeta: 5, cashMeta: 0, scheduleMeta: 0, cancellationsMeta: 0, stockMeta: 0, inventoryMeta: 0 });

  it('Tarefas tem o campo de peso editável (100) em vez de "por checklist"; as coberturas novas têm campo; Ocorrências segue "Sem indicador"', () => {
    const html = renderToString(React.createElement(MetaPorModuloClient, { grupos, canEdit: true }));
    expect(html).not.toContain('por checklist');
    expect(html).toContain('aria-label="Peso de Tarefas"');
    /* v1.174.1: o kit põe white-space:nowrap em todo td; sem quebrar linha, o texto longo de "Como entra na nota" empurrava a coluna do peso para fora da tela (print do Pedro) */
    expect(html).toContain('max-w-md whitespace-normal');
    expect(html).toContain('max-w-xs whitespace-normal');
    const css = readFileSync('src/styles/globals.css', 'utf8');
    expect(css).toContain('.sgo-tbl td.whitespace-normal, .sgo-tbl tbody td.whitespace-normal { white-space: normal; }');
    expect(html).toMatch(/aria-label="Peso de Tarefas"[^>]*value="100"/);
    expect(html).toContain('aria-label="Peso de Gestão de Troco"');
    expect(html).toContain('aria-label="Peso de Cancelamentos"');
    expect(html).toContain('aria-label="Peso de Inventário"');
    expect(html).toContain('aria-label="Peso de Estoque (validade e lotes)"');
    expect(html).toContain('aria-label="Peso de Escala (grade de presença)"');
    const occ = html.slice(html.indexOf('data-testid="meta-modulo-OCCURRENCES"'), html.indexOf('data-testid="meta-modulo-OCCURRENCES"') + 1200);
    expect(occ).toContain('Sem indicador');
    expect(occ).not.toContain('aria-label="Peso de');
  });

  it('a página não tem mais a aba Componentes (fonte): só o cabeçalho e a lista por módulo', () => {
    const page = readFileSync('src/app/(app)/modulos/metas/config/page.tsx', 'utf8');
    expect(page).not.toContain('MetaConfigClient');
    expect(page).not.toContain("aba-componentes");
    expect(page).toContain('MetaPorModuloClient');
    expect(page).toContain('getTasksMetaWeight');
  });
});

describe('Composição da meta com o detalhe por checklist', () => {
  it('a tabela mostra "Checklists do dia" como componente e cada checklist recuado, sem peso, como informação', () => {
    const c = comporMeta([
      { name: 'Checklists do dia', weight: 100, done: 3, resolved: 4, scorePct: 75 },
      { name: 'Abertura', weight: 0, done: 2, resolved: 3, scorePct: 67, tipo: 'DETALHE' },
      { name: 'Fechamento', weight: 0, done: 1, resolved: 1, scorePct: 100, tipo: 'DETALHE' },
      { name: 'Fora do prazo (−2% na meta)', weight: 0, done: 0, resolved: 1, scorePct: 0, tipo: 'DESCONTO' },
    ]);
    const html = renderToString(React.createElement(RoscaDaComposicao, { composicao: c })).split('<!-- -->').join('');
    expect(html).toContain('data-testid="detalhe-checklists"');
    expect(html).toContain('↳ Abertura');
    expect(html).toContain('↳ Fechamento');
    expect(html).toContain('2/3');
    expect(html).toContain('Por checklist');
    /* o desconto aparece como informação, sem a frase antiga de "data corrigida" presa a todo desconto */
    expect(html).toContain('Fora do prazo (−2% na meta) — desconto aplicado direto no % da meta.');
    expect(html).not.toContain('lançamento(s) com data corrigida');
  });
});
