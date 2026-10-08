import { describe, it, expect } from 'vitest';
import { resumirUso, taxaDeFalha, faixaDeUso, rotuloDoModulo, type UnidadeUso, type UsuarioUso } from '@/lib/metas/uso-calculo';

/** Uso do SGO (v1.164.0): composição PURA de contagens já existentes — nada recalcula meta nem uso. */
const unidade = (p: Partial<UnidadeUso> & { unitId: string }): UnidadeUso => ({
  unitName: p.unitId, usagePct: 0, checklistPct: 0, wastePct: 0, commandsPct: 0, metaPct: 0, done: 0, late: 0, missed: 0, acoes: 0, usuariosAtivos: 0, usuariosVinculados: 0, occurrences: 0, notes: 0, ...p,
});
const usuario = (p: Partial<UsuarioUso> & { userId: string }): UsuarioUso => ({
  name: p.userId, role: 'MANAGER', roleLabel: 'Gerente', unidades: [], acessos: 0, acoes: 0, modulos: [], tarefasConcluidas: 0, foraDoPrazo: 0, ultimoAcesso: null, ...p,
});

describe('taxa de falha e faixa de uso', () => {
  it('falhas = (fora do prazo + não realizadas) ÷ resolvidas; sem tarefa resolvida não é zero, é nulo', () => {
    expect(taxaDeFalha({ done: 8, late: 1, missed: 1 })).toBe(20);
    expect(taxaDeFalha({ done: 0, late: 0, missed: 0 })).toBeNull();
  });
  it('a faixa de uso é o mesmo semáforo da meta (≥80 verde, ≥50 âmbar)', () => {
    expect(faixaDeUso(80)).toBe('VERDE'); expect(faixaDeUso(50)).toBe('AMBAR'); expect(faixaDeUso(49)).toBe('VERMELHO');
  });
  it('módulo da Auditoria vira rótulo legível; desconhecido sai como veio', () => {
    expect(rotuloDoModulo('TASKS')).toBe('Tarefas'); expect(rotuloDoModulo('XPTO')).toBe('XPTO');
  });
});

describe('resumirUso', () => {
  const unidades = [
    unidade({ unitId: 'A', usagePct: 90, done: 18, late: 1, missed: 1, acoes: 50 }),
    unidade({ unitId: 'B', usagePct: 60, done: 5, late: 2, missed: 3, acoes: 20 }),
    unidade({ unitId: 'C', usagePct: 30, done: 2, late: 0, missed: 8, acoes: 3 }),
  ];
  const usuarios = [
    usuario({ userId: 'ana', acoes: 40, tarefasConcluidas: 15 }),
    usuario({ userId: 'bia', acoes: 10, tarefasConcluidas: 3 }),
    usuario({ userId: 'caio', acoes: 0 }),
  ];
  const r = resumirUso(unidades, usuarios);
  it('quem mais usa e quem menos usa, por unidade e por usuário', () => {
    expect(r.unidadeMaisUsa?.unitId).toBe('A');
    expect(r.unidadeMenosUsa?.unitId).toBe('C');
    expect(r.maisUsam.map((u) => u.userId)).toEqual(['ana', 'bia']);
    expect(r.usuariosSemUso.map((u) => u.userId)).toEqual(['caio']);
    expect(r.usuariosAtivos).toBe(2);
  });
  it('quem mais deixa de fazer é pela PROPORÇÃO de não realizadas, e quem mais erra pela taxa de falha', () => {
    expect(r.unidadeMaisDeixaDeFazer?.unitId).toBe('C');
    expect(r.unidadeMaisDeixaDeFazer?.taxa).toBe(80);
    expect(r.unidadeMaisErra?.unitId).toBe('C');
    expect(r.unidadeMaisErra?.taxa).toBe(80);
  });
  it('faixas, média de uso e tarefas da rede somadas', () => {
    expect(r.porFaixa.map((f) => f.qtd)).toEqual([1, 1, 1]);
    expect(r.mediaUso).toBe(60);
    expect(r.tarefas).toEqual({ done: 25, late: 3, missed: 12, resolvidas: 40, pctNoPrazo: 63 });
    expect(r.totalAcoes).toBe(50);
  });
  it('rede vazia não quebra: tudo nulo ou zero, sem destaque inventado', () => {
    const v = resumirUso([], []);
    expect(v.mediaUso).toBeNull(); expect(v.unidadeMaisUsa).toBeNull(); expect(v.unidadeMaisErra).toBeNull(); expect(v.unidadeMaisDeixaDeFazer).toBeNull();
    expect(v.tarefas.pctNoPrazo).toBeNull(); expect(v.maisUsam).toEqual([]);
  });
  it('com uma unidade só não há "menos usa"; sem tarefa não realizada não há "mais deixa de fazer"', () => {
    const v = resumirUso([unidade({ unitId: 'A', usagePct: 90, done: 10 })], []);
    expect(v.unidadeMaisUsa?.unitId).toBe('A'); expect(v.unidadeMenosUsa).toBeNull(); expect(v.unidadeMaisDeixaDeFazer).toBeNull(); expect(v.unidadeMaisErra).toBeNull();
  });
});
