import { describe, it, expect } from 'vitest';
import { agregarRede, calcularDeltas, pontosDeAtencao, resumoDoPeriodo, type UnidadeExecutiva } from '@/lib/supervisor/rede';

/**
 * PAINEL EXECUTIVO DA REDE — núcleo puro.
 * Estes casos travam a agregação, a variação e os pontos de atenção SEM banco:
 * a fonte por unidade (`getUsageBoard`) já é testada em outro lugar, e aqui o
 * que importa é a composição da rede não inventar número.
 */

function u(over: Partial<UnidadeExecutiva>): UnidadeExecutiva {
  return {
    unitId: over.unitId ?? 'u1', unitName: over.unitName ?? 'Unidade',
    checklistPct: 0, wastePct: 0, commandsPct: 0, occurrences: 0, notes: 0, cashSessions: 0,
    metaPct: 0, usagePct: 0, tone: 'critical',
    checklistsDone: 0, checklistsLate: 0, checklistsMissed: 0,
    ocorrenciasAbertas: 0, ocorrenciasCriticas: 0,
    metaDelta: null, usoDelta: null, checklistDelta: null,
    ...over,
  };
}

describe('agregarRede', () => {
  it('performance/uso são MÉDIA das % das unidades; contagens são SOMA', () => {
    const r = agregarRede([
      u({ metaPct: 80, usagePct: 60, notes: 3, cashSessions: 2, checklistsDone: 10, checklistsMissed: 0 }),
      u({ metaPct: 40, usagePct: 20, notes: 1, cashSessions: 0, checklistsDone: 6, checklistsMissed: 4 }),
    ]);
    expect(r.performance).toBe(60); // (80+40)/2
    expect(r.uso).toBe(40); // (60+20)/2
    expect(r.notas).toBe(4); // soma
    expect(r.cofre).toBe(2);
    expect(r.unidades).toBe(2);
  });

  it('no prazo / fora / não realizados / execução saem dos DONE/LATE/MISSED somados', () => {
    const r = agregarRede([
      u({ checklistsDone: 60, checklistsLate: 20, checklistsMissed: 20 }), // total 100
      u({ checklistsDone: 40, checklistsLate: 0, checklistsMissed: 60 }), // total 100
    ]);
    // done=100 late=20 missed=80 total=200
    expect(r.noPrazoPct).toBe(50); // 100/200
    expect(r.foraPrazoPct).toBe(10); // 20/200
    expect(r.naoRealizadosPct).toBe(40); // 80/200
    expect(r.execucaoPct).toBe(60); // 120/200
  });

  it('rede vazia não divide por zero', () => {
    const r = agregarRede([]);
    expect(r.performance).toBe(0);
    expect(r.noPrazoPct).toBe(0);
    expect(r.unidades).toBe(0);
  });
});

describe('calcularDeltas', () => {
  it('variação em p.p. do atual contra o anterior', () => {
    const atual = agregarRede([u({ metaPct: 70, usagePct: 50, checklistsDone: 82, checklistsMissed: 18 })]);
    const anterior = agregarRede([u({ metaPct: 64, usagePct: 55, checklistsDone: 76, checklistsMissed: 24 })]);
    const d = calcularDeltas(atual, anterior);
    expect(d.performance).toBe(6); // 70-64
    expect(d.uso).toBe(-5); // 50-55
    expect(d.noPrazo).toBe(6); // 82% - 76%
  });

  it('sem base anterior, os deltas são null', () => {
    const atual = agregarRede([u({ metaPct: 70 })]);
    expect(calcularDeltas(atual, null)).toEqual({ performance: null, uso: null, noPrazo: null });
  });
});

describe('pontosDeAtencao', () => {
  it('ocorrência crítica é o alerta mais grave e vem primeiro', () => {
    const p = pontosDeAtencao([
      u({ unitId: 'a', unitName: 'A', usagePct: 90, ocorrenciasCriticas: 2, wastePct: 80, checklistsDone: 10 }),
    ]);
    expect(p[0].tipo).toBe('OCORRENCIA_CRITICA');
    expect(p[0].severidade).toBe(3);
  });

  it('queda de performance >= 5 p.p. vira ponto; 4 p.p. não', () => {
    const cai = pontosDeAtencao([u({ unitId: 'a', unitName: 'A', usagePct: 90, wastePct: 80, metaPct: 70, metaDelta: -6, checklistsDone: 5 })]);
    expect(cai.some((x) => x.tipo === 'QUEDA_PERFORMANCE')).toBe(true);
    const naoCai = pontosDeAtencao([u({ unitId: 'a', unitName: 'A', usagePct: 90, wastePct: 80, metaPct: 70, metaDelta: -4, checklistsDone: 5 })]);
    expect(naoCai.some((x) => x.tipo === 'QUEDA_PERFORMANCE')).toBe(false);
  });

  it('uso baixo (<50) e sem desperdício (0) viram alertas', () => {
    const p = pontosDeAtencao([u({ unitId: 'a', unitName: 'A', usagePct: 27, wastePct: 0, checklistsDone: 5 })]);
    expect(p.some((x) => x.tipo === 'USO_BAIXO')).toBe(true);
    expect(p.some((x) => x.tipo === 'SEM_DESPERDICIO')).toBe(true);
  });

  it('muito não realizado (missed >= done) aparece; done>missed não', () => {
    const ruim = pontosDeAtencao([u({ unitId: 'a', unitName: 'A', usagePct: 90, wastePct: 80, checklistsDone: 3, checklistsMissed: 10 })]);
    expect(ruim.some((x) => x.tipo === 'NAO_REALIZADOS')).toBe(true);
    const ok = pontosDeAtencao([u({ unitId: 'a', unitName: 'A', usagePct: 90, wastePct: 80, checklistsDone: 10, checklistsMissed: 3 })]);
    expect(ok.some((x) => x.tipo === 'NAO_REALIZADOS')).toBe(false);
  });

  it('unidade dentro do esperado não gera alerta nenhum', () => {
    const p = pontosDeAtencao([u({ unitId: 'a', unitName: 'A', usagePct: 88, wastePct: 70, metaPct: 85, metaDelta: 2, checklistsDone: 20, checklistsMissed: 2, ocorrenciasCriticas: 0 })]);
    expect(p).toHaveLength(0);
  });
});

describe('resumoDoPeriodo', () => {
  it('conta quedas, melhoras, críticas, sem-desperdício e a execução geral', () => {
    const r = resumoDoPeriodo([
      u({ unitId: 'a', metaDelta: -3, checklistDelta: 5, wastePct: 50, checklistsDone: 80, checklistsLate: 0, checklistsMissed: 20 }),
      u({ unitId: 'b', metaDelta: 2, checklistDelta: -1, wastePct: 0, ocorrenciasCriticas: 1, checklistsDone: 40, checklistsLate: 0, checklistsMissed: 60 }),
    ]);
    expect(r.unidades).toBe(2);
    expect(r.performanceCaiu).toBe(1); // só a
    expect(r.checklistsMelhorou).toBe(1); // só a
    expect(r.ocorrenciasCriticas).toBe(1);
    expect(r.semDesperdicio).toBe(1); // b
    // done=120 late=0 missed=80 total=200 → (120)/200 = 60
    expect(r.execucaoGeralPct).toBe(60);
  });
});
