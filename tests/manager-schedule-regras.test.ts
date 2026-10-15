import { describe, it, expect } from 'vitest';
import {
  amanha, motivoValido, podeLancarPropria, podeApagarPropria, situacaoNoDia, montarUnidadeHoje, resumirHoje,
  proximasAusencias, diasDentro, MOTIVO_MIN, type GerenteHoje,
} from '@/lib/manager-schedule-regras';
import { linhasPorModulo, resumirPorModulo, INDICADORES } from '@/lib/metas/por-modulo';
import { MODULES } from '@/lib/permissions';
import { AREAS } from '@/lib/nav/areas';

/**
 * Escala de gerentes (v1.170.0) — as regras PURAS do pedido do Pedro:
 * o gerente só lança a própria folga para o FUTURO, só apaga o que ele lançou,
 * e apagar exige motivo. Mais a leitura "hoje na rede" e a meta por módulo.
 */
describe('o gerente lança a própria folga só a partir de amanhã', () => {
  it('hoje é dia 15: ontem, hoje e datas passadas são recusadas; amanhã passa', () => {
    expect(podeLancarPropria('2026-10-15', '2026-10-14')).toBe('DATA_PASSADA');
    expect(podeLancarPropria('2026-10-15', '2026-10-15')).toBe('DATA_PASSADA');
    expect(podeLancarPropria('2026-10-15', '2026-09-30')).toBe('DATA_PASSADA');
    expect(podeLancarPropria('2026-10-15', '2026-10-16')).toBeNull();
    expect(podeLancarPropria('2026-10-15', '2026-11-01')).toBeNull();
    expect(podeLancarPropria('2026-10-15', 'ontem')).toBe('INVALID');
  });
  it('amanhã vira o mês e o ano', () => {
    expect(amanha('2026-10-15')).toBe('2026-10-16');
    expect(amanha('2026-10-31')).toBe('2026-11-01');
    expect(amanha('2026-12-31')).toBe('2027-01-01');
  });
});

describe('o gerente só apaga o que ele mesmo lançou e ainda não aconteceu', () => {
  const eu = 'u-ana';
  it('dele, lançado por ele, no futuro: pode', () => {
    expect(podeApagarPropria('2026-10-15', eu, { userId: eu, createdById: eu, startDate: '2026-10-20' })).toBeNull();
  });
  it('lançado pela Supervisão para ele: não é dele para apagar', () => {
    expect(podeApagarPropria('2026-10-15', eu, { userId: eu, createdById: 'u-sup', startDate: '2026-10-20' })).toBe('NAO_E_SEU');
  });
  it('de outro gerente: nunca', () => {
    expect(podeApagarPropria('2026-10-15', eu, { userId: 'u-bruno', createdById: eu, startDate: '2026-10-20' })).toBe('NAO_E_SEU');
  });
  it('já aconteceu (ou é hoje): fica para a Supervisão', () => {
    expect(podeApagarPropria('2026-10-15', eu, { userId: eu, createdById: eu, startDate: '2026-10-15' })).toBe('DATA_PASSADA');
    expect(podeApagarPropria('2026-10-15', eu, { userId: eu, createdById: eu, startDate: '2026-10-01' })).toBe('DATA_PASSADA');
  });
});

describe('motivo da exclusão', () => {
  it(`exige ${MOTIVO_MIN} caracteres de verdade — "erro" e espaços não contam`, () => {
    expect(motivoValido('erro')).toBe(false);
    expect(motivoValido('          ')).toBe(false);
    expect(motivoValido(undefined)).toBe(false);
    expect(motivoValido(42)).toBe(false);
    expect(motivoValido('Troquei a folga para o dia 22')).toBe(true);
  });
});

describe('hoje na rede', () => {
  const g = (name: string, weekdays: number[], ausencias: GerenteHoje['ausencias'] = []): GerenteHoje =>
    ({ userId: `u-${name}`, name, weekdays, startTime: null, endTime: null, ausencias });
  /* 2026-10-15 é quinta (4). */
  const HOJE = '2026-10-15';

  it('o lançamento vence o padrão semanal; sem horário = não sabe', () => {
    expect(situacaoNoDia(g('Ana', [1, 2, 3, 4, 5]), HOJE).situacao).toBe('TRABALHA');
    expect(situacaoNoDia(g('Ana', [1, 2, 3, 4, 5], [{ kind: 'FOLGA', startDate: HOJE, endDate: HOJE, note: null, lancadoPor: null }]), HOJE).situacao).toBe('FOLGA');
    expect(situacaoNoDia(g('Ana', [0, 6]), HOJE).situacao).toBe('FORA_DO_PADRAO');
    expect(situacaoNoDia(g('Ana', []), HOJE).situacao).toBe('SEM_HORARIO');
  });

  it('unidade sem gerente = ninguém com horário trabalha hoje (e há horário cadastrado)', () => {
    const ferias = [{ kind: 'FERIAS' as const, startDate: '2026-10-01', endDate: '2026-10-20', note: null, lancadoPor: 'Sup' }];
    const u = montarUnidadeHoje('u1', 'Centro', [g('Ana', [1, 2, 3, 4, 5], ferias), g('Bruno', [1, 2, 3, 4, 5], [{ kind: 'FOLGA', startDate: HOJE, endDate: HOJE, note: null, lancadoPor: null }])], HOJE);
    expect(u.semGerente).toBe(true);
    expect(u.cobertura).toEqual([]);
    expect(u.linhas.find((l) => l.name === 'Bruno')?.voltaAmanha).toBe(true);
    expect(u.linhas.find((l) => l.name === 'Ana')?.voltaAmanha).toBe(false);

    const coberta = montarUnidadeHoje('u1', 'Centro', [g('Ana', [1, 2, 3, 4, 5], ferias), g('Carla', [4])], HOJE);
    expect(coberta.semGerente).toBe(false);
    expect(coberta.cobertura).toEqual(['Carla']);

    /* ninguém tem horário: não acusa buraco, acusa falta de cadastro */
    const semHorario = montarUnidadeHoje('u1', 'Centro', [g('Ana', [])], HOJE);
    expect(semHorario.semGerente).toBe(false);
    expect(semHorario.semHorario).toBe(true);
  });

  it('o resumo conta pessoas uma vez, mesmo em duas unidades', () => {
    const ana = g('Ana', [1, 2, 3, 4, 5], [{ kind: 'FOLGA', startDate: HOJE, endDate: HOJE, note: null, lancadoPor: null }]);
    const r = resumirHoje([
      montarUnidadeHoje('u1', 'Centro', [ana, g('Bruno', [4])], HOJE),
      montarUnidadeHoje('u2', 'Orla', [ana], HOJE),
    ]);
    expect(r).toEqual({ gerentes: 2, trabalhando: 1, deFolga: 1, deFerias: 0, unidadesSemGerente: 1, voltamAmanha: 1 });
  });

  it('próximos 7 dias lista só o que está lançado, dia a dia', () => {
    const p = proximasAusencias([{ unitName: 'Centro', gerentes: [g('Ana', [1], [{ kind: 'FOLGA', startDate: '2026-10-17', endDate: '2026-10-18', note: null, lancadoPor: null }])] }], HOJE, 7);
    expect(p.map((x) => x.iso)).toEqual(['2026-10-17', '2026-10-18']);
    expect(proximasAusencias([{ unitName: 'Centro', gerentes: [g('Ana', [1], [{ kind: 'FOLGA', startDate: '2026-10-30', endDate: '2026-10-30', note: null, lancadoPor: null }])] }], HOJE, 7)).toEqual([]);
  });

  it('dias dentro do mês: férias que atravessam o mês contam só a parte de dentro', () => {
    expect(diasDentro('2026-09-25', '2026-10-05', '2026-10-01', '2026-10-31')).toBe(5);
    expect(diasDentro('2026-10-10', '2026-10-10', '2026-10-01', '2026-10-31')).toBe(1);
    expect(diasDentro('2026-11-01', '2026-11-03', '2026-10-01', '2026-10-31')).toBe(0);
  });
});

describe('meta por módulo', () => {
  const grupos = linhasPorModulo(MODULES, AREAS, { wasteMeta: 2, commandsMeta: 0, communication: 1, training: 0, evaluation: 0, lateEntry: 2, managerLeaveMeta: 5 });
  const linhas = grupos.flatMap((g) => g.linhas);

  it('lista módulos de todas as áreas de operação, sem a área Administrativo', () => {
    expect(grupos.map((g) => g.area)).not.toContain('Administrativo');
    expect(linhas.length).toBeGreaterThan(25);
    expect(linhas.some((l) => l.key === 'DASHBOARD')).toBe(false);
  });

  it('todo indicador registrado aponta para um módulo que existe', () => {
    const keys = new Set(MODULES.map((m) => m.key));
    for (const k of Object.keys(INDICADORES)) expect(keys.has(k), k).toBe(true);
  });

  it('módulo com indicador mostra o valor; sem indicador fica sem campo (valor nulo)', () => {
    const escala = linhas.find((l) => l.key === 'MANAGER_SCHEDULE');
    expect(escala?.indicador?.tipo).toBe('DESCONTO');
    expect(escala?.valor).toBe(5);
    const desperdicio = linhas.find((l) => l.key === 'WASTE');
    expect(desperdicio?.valor).toBe(2);
    const ocorrencias = linhas.find((l) => l.key === 'OCCURRENCES');
    expect(ocorrencias?.indicador).toBeNull();
    expect(ocorrencias?.valor).toBeNull();
  });

  it('a Escala de gerentes aparece mesmo sendo parte interna de Pessoas; o fora do prazo diz com quem é compartilhado', () => {
    expect(linhas.some((l) => l.key === 'MANAGER_SCHEDULE')).toBe(true);
    expect(linhas.some((l) => l.key === 'PEOPLE_EVALUATION')).toBe(true);
    const notas = linhas.find((l) => l.key === 'NOTES');
    expect(notas?.compartilhadoCom).toEqual(['Pagamentos', 'Recebimento de Gás', 'Coleta de Óleo']);
  });

  it('o resumo conta o que está ligado (acima de 0) e o que não tem indicador', () => {
    const r = resumirPorModulo(grupos);
    expect(r.comIndicador).toBe(Object.keys(INDICADORES).length);
    /* ligados: checklists (por item), desperdício 2, comunicados 1, fora do prazo 2 (×4 módulos), escala 5 */
    expect(r.ligados).toBe(1 + 1 + 1 + 4 + 1);
    expect(r.semIndicador).toBe(r.modulos - r.comIndicador);
  });
});
