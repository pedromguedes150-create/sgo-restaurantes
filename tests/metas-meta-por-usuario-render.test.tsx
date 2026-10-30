import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { TabelaMetaPorUsuario } from '@/components/metas/uso-do-sgo';
import type { UsuarioUso } from '@/lib/metas/uso-calculo';

/** Quadro "Meta por usuário" (v1.179.0): uma coluna por componente com peso, descontos, folga própria e a nota. */

const base = (p: Partial<UsuarioUso> & { userId: string }): UsuarioUso => ({
  name: p.userId, role: 'MANAGER', roleLabel: 'Gerente', unidades: [], acessos: 0, acoes: 0, modulos: [], tarefasConcluidas: 0, foraDoPrazo: 0, ultimoAcesso: null, meta: null, folgaPropria: null, ...p,
});
const pesos = [{ key: 'TASKS', name: 'Checklists do dia', weight: 50 }, { key: 'WASTE', name: 'Desperdício diário (cobertura)', weight: 40 }, { key: 'COMMANDS', name: 'Comandas', weight: 30 }];

const usuarios: UsuarioUso[] = [
  base({ userId: 'grazieli', name: 'Grazieli', folgaPropria: true, meta: {
    scorePct: 45, notaAntesDosDescontos: 50, descontoTotal: 5,
    componentes: [{ key: 'TASKS', name: 'Checklists do dia', weight: 50, scorePct: 50 }, { key: 'WASTE', name: 'Desperdício diário (cobertura)', weight: 40, scorePct: 50 }, { key: 'COMMANDS', name: 'Comandas', weight: 30, scorePct: null }],
    unidades: [{ unitId: 'u1', unitName: 'Jardim Teresópolis', scorePct: 45 }],
  } }),
  base({ userId: 'sup', name: 'Supervisora', roleLabel: 'Supervisor', role: 'SUPERVISOR', folgaPropria: null, meta: {
    scorePct: 90, notaAntesDosDescontos: 90, descontoTotal: 0,
    componentes: [{ key: 'TASKS', name: 'Checklists do dia', weight: 50, scorePct: 90 }, { key: 'WASTE', name: 'Desperdício diário (cobertura)', weight: 40, scorePct: 90 }, { key: 'COMMANDS', name: 'Comandas', weight: 30, scorePct: null }],
    unidades: [{ unitId: 'u1', unitName: 'Jardim Teresópolis', scorePct: 90 }, { unitId: 'u2', unitName: 'Vespasiano', scorePct: 90 }],
  } }),
  base({ userId: 'semunidade', name: 'Sem Unidade' }),
];

describe('TabelaMetaPorUsuario', () => {
  const html = renderToString(React.createElement(TabelaMetaPorUsuario, { usuarios, pesos })).split('<!-- -->').join('');

  it('uma coluna por componente com peso, do maior para o menor, com o peso no cabeçalho', () => {
    expect(html).toContain('Checklists');
    expect(html).toContain('(peso 50)');
    expect(html).toContain('(peso 40)');
    expect(html).toContain('(peso 30)');
    expect(html.indexOf('(peso 50)')).toBeLessThan(html.indexOf('(peso 40)'));
  });

  it('mostra o % de cada componente, "—" onde não houve o que medir, o desconto e a nota final', () => {
    expect(html).toContain('45%');
    expect(html).toContain('−5');
    expect(html).toContain('—'); // Comandas sem nada a medir
    expect(html).toContain('Jardim Teresópolis 45%');
  });

  it('explica a conta por extenso e ordena pela nota (maior primeiro)', () => {
    expect(html).toContain('Checklists 50 × 50% + Desperdício 40 × 50% ÷ 90 = 50% · descontos −5 = 45%');
    expect(html).toContain('(média de 2 unidades)');
    expect(html.indexOf('Supervisora')).toBeLessThan(html.indexOf('Grazieli'));
  });

  it('folga própria: Sim para o gerente que lançou, "—" para quem não é medido nisso; quem não tem unidade fica fora', () => {
    expect(html).toContain('Sim');
    expect(html).not.toContain('Sem Unidade');
    expect((html.match(/data-testid="linha-meta-usuario"/g) ?? []).length).toBe(2);
  });
});
