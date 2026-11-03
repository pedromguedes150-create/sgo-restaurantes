import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import React from 'react';
import { TabelaUnidades, TabelaUsuarios } from '@/components/metas/uso-do-sgo';
import { piorComponente, pontualidade, resumirUso, type UnidadeUso, type UsuarioUso } from '@/lib/metas/uso-calculo';

/**
 * Uso do SGO — PR B (v1.182.0): uso EFETIVO (cumprimento, não acesso) e
 * gestão por unidade (responsáveis, onde mais perde, descontos nomeados),
 * em dois blocos de análise — nenhuma regra de desconto nova.
 */
const unidade = (p: Partial<UnidadeUso> & { unitId: string }): UnidadeUso => ({
  unitName: p.unitId, usagePct: 0, checklistPct: 0, wastePct: 0, commandsPct: 0, metaPct: 0, done: 0, late: 0, missed: 0, acoes: 0, usuariosAtivos: 0, usuariosVinculados: 0, occurrences: 0, notes: 0,
  pendentes: 0, vencidas: 0, responsaveis: [], piorComponente: null, descontos: [], ...p,
});
const usuario = (p: Partial<UsuarioUso> & { userId: string }): UsuarioUso => ({
  name: p.userId, role: 'MANAGER', roleLabel: 'Gerente', unidades: [], acessos: 0, acoes: 0, modulos: [], tarefasConcluidas: 0, foraDoPrazo: 0, ultimoAcesso: null, meta: null, folgaPropria: null,
  pontualidade: null, pendentes: 0, vencidas: 0, naoRealizadas: 0, ...p,
});

describe('regras puras', () => {
  it('pontualidade = no prazo ÷ (no prazo + fora); sem conclusão é nula, não zero', () => {
    expect(pontualidade(9, 1)).toBe(90);
    expect(pontualidade(1, 1)).toBe(50);
    expect(pontualidade(0, 0)).toBeNull();
    expect(pontualidade(0, 3)).toBe(0);
  });
  it('onde mais perde = o componente que pesa com o pior %; empate vai para o maior peso; sem componente é nulo', () => {
    const meta = { componentes: [
      { key: 'TASKS', name: 'Checklists do dia', weight: 100, done: 9, resolved: 10, scorePct: 90 },
      { key: 'WASTE', name: 'Desperdício', weight: 40, done: 5, resolved: 10, scorePct: 50 },
      { key: 'CASH', name: 'Cofre', weight: 60, done: 5, resolved: 10, scorePct: 50 },
    ] };
    expect(piorComponente(meta)).toEqual({ key: 'CASH', name: 'Cofre', weight: 60, scorePct: 50 });
    expect(piorComponente({ componentes: [] })).toBeNull();
    expect(piorComponente(null)).toBeNull();
  });
  it('o resumo soma o que está aberto na rede e aponta a unidade com mais vencidas', () => {
    const r = resumirUso([unidade({ unitId: 'A', pendentes: 2, vencidas: 1 }), unidade({ unitId: 'B', pendentes: 1, vencidas: 4 })], []);
    expect(r.pendencias).toMatchObject({ pendentes: 3, vencidas: 5 });
    expect(r.pendencias.unidadeMaisVencidas?.unitId).toBe('B');
    expect(resumirUso([unidade({ unitId: 'A' })], []).pendencias.unidadeMaisVencidas).toBeNull();
  });
});

describe('tabelas', () => {
  it('unidade: responsáveis, abertas, vencidas, onde mais perde com os descontos nomeados, e o link para a composição', () => {
    const html = renderToString(React.createElement(TabelaUnidades, { ym: '2026-11', unidades: [
      unidade({ unitId: 'u1', unitName: 'Beija Flor Orla', responsaveis: ['Carla', 'Gabriel'], pendentes: 3, vencidas: 2, piorComponente: { key: 'WASTE', name: 'Desperdício diário (cobertura)', weight: 40, scorePct: 35 }, descontos: [{ name: 'Escala de gerentes', quantidade: 1, pct: 5, total: 5, detalhe: 'sem folga cadastrada: Gabriel' }] }),
      unidade({ unitId: 'u2', unitName: 'Beija Flor Centro' }),
    ] })).split('<!-- -->').join('');
    expect(html).toContain('Responsáveis');
    expect(html).toContain('Carla, Gabriel');
    expect(html).toContain('sem gerente vinculado');
    expect(html).toContain('Desperdício <b>35%</b> (peso 40)');
    expect(html).toContain('−5: Escala de gerentes 1× — sem folga cadastrada: Gabriel');
    expect(html).toContain('href="/modulos/metas?month=2026-11&amp;unit=u1"');
    expect(html).toContain('<th class="text-right">Vencidas</th>');
  });
  it('usuário: pontualidade, abertas, vencidas e não feitas ao lado de acessos e ações', () => {
    const html = renderToString(React.createElement(TabelaUsuarios, { usuarios: [
      usuario({ userId: 'g', name: 'Grazieli', acessos: 12, acoes: 40, tarefasConcluidas: 9, foraDoPrazo: 1, pontualidade: 90, pendentes: 2, vencidas: 1, naoRealizadas: 3 }),
      usuario({ userId: 's', name: 'Sem conclusão' }),
    ] })).split('<!-- -->').join('');
    expect(html).toContain('Pontualidade');
    expect(html).toContain('90%');
    expect(html).toContain('Concluiu no prazo');
    expect(html).toContain('Não feitas');
    /* sem conclusão: "—", não 0% */
    expect(html).toContain('—');
  });
});
