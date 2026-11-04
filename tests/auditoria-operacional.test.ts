import { describe, it, expect } from 'vitest';
import {
  componenteOperacional, conformidade, dataDoLancamento, dentroDaJanela, diasEntre, limitesDoMes, MODULOS_AUDITADOS, MODULOS_DA_VIGENCIA, moduloAuditado,
  normalizarReferencia, somarDiasIso, type SituacaoDaAuditoria,
} from '@/lib/auditoria-operacional/regras';
import { CHAVES_DA_META, COMPONENTES_DA_META, PARAMETROS_DA_AUDITORIA_OPERACIONAL, PARAMETROS_DE_AUDITORIA, valorLegivel } from '@/lib/metas/vigencia-regras';
import { INDICADORES, INDICADORES_EXTRAS, linhasPorModulo } from '@/lib/metas/por-modulo';
import { pontuar, type ComponenteDaMeta } from '@/lib/metas/pontuacao';

/**
 * AUDITORIA OPERACIONAL (v1.184.0) — as regras, sem banco: o desconto por
 * falha sobre o peso (até 100%), o catálogo casado com a vigência, a janela
 * do cruzamento, a data do fato por módulo e as linhas extras da meta.
 */
const sit = (...s: SituacaoDaAuditoria[]) => conformidade(s);

describe('desconto por falha confirmada, sobre o PESO, até 100%', () => {
  it('nada decidido = neutro (0/0, fora da conta)', () => {
    expect(componenteOperacional(sit('NO_PRAZO', 'EM_CONFERENCIA', 'INVALIDO'), 10)).toEqual({ done: 0, missed: 0, scorePct: 0, penalizacao: 0 });
  });
  it('1 falha com 10% = 90 pontos; conformes e justificadas contam como feitas', () => {
    expect(componenteOperacional(sit('CONFORME', 'JUSTIFICADO', 'FALHA_CONFIRMADA'), 10)).toEqual({ done: 2, missed: 1, scorePct: 90, penalizacao: 10 });
  });
  it('acumula por falha e para em 100%: 3 falhas com 40% = 100% de desconto, 0 pontos', () => {
    expect(componenteOperacional(sit('FALHA_CONFIRMADA', 'FALHA_CONFIRMADA', 'FALHA_CONFIRMADA'), 40)).toMatchObject({ scorePct: 0, penalizacao: 100 });
    expect(componenteOperacional(sit('CONFORME', 'FALHA_CONFIRMADA', 'FALHA_CONFIRMADA'), 25)).toMatchObject({ scorePct: 50, penalizacao: 50 });
  });
  it('% fora da faixa é contido entre 0 e 100; % zero não desconta', () => {
    expect(componenteOperacional(sit('FALHA_CONFIRMADA'), 250)).toMatchObject({ scorePct: 0, penalizacao: 100 });
    expect(componenteOperacional(sit('FALHA_CONFIRMADA'), 0)).toMatchObject({ scorePct: 100, penalizacao: 0 });
    expect(componenteOperacional(sit('FALHA_CONFIRMADA'), Number.NaN)).toMatchObject({ scorePct: 100, penalizacao: 0 });
  });
  it('entra na composição pelo scorePct — peso 10 com 2 falhas de 10% = 8 pontos de 10', () => {
    const comp = componenteOperacional(sit('CONFORME', 'FALHA_CONFIRMADA', 'FALHA_CONFIRMADA'), 10);
    const componentes: ComponenteDaMeta[] = [
      { key: 'TASKS', name: 'Checklists', weight: 10, status: 'ATIVO', done: 10, missed: 0 },
      { key: 'NOTES_AUDIT', name: 'Notas', weight: 10, status: 'ATIVO', done: comp.done, missed: comp.missed, scorePct: comp.scorePct },
    ];
    expect(pontuar(componentes, []).scorePct).toBe(90); // (10×100 + 10×80) ÷ 20
    /* em Monitoramento o componente fica fora: a nota segue 100 */
    expect(pontuar([componentes[0], { ...componentes[1], status: 'MONITORAMENTO' }], []).scorePct).toBe(100);
  });
});

describe('catálogo dos módulos casado com a vigência', () => {
  it('os quatro módulos, os quatro componentes (peso 0) e os oito parâmetros (24 h · 10%)', () => {
    expect(MODULOS_AUDITADOS.map((m) => [m.key, m.componente])).toEqual(MODULOS_DA_VIGENCIA.map((m) => [m.key, m.componente]));
    for (const m of MODULOS_AUDITADOS) {
      expect(COMPONENTES_DA_META.find((c) => c.key === m.componente)).toMatchObject({ pesoPadrao: 0 });
      expect(PARAMETROS_DE_AUDITORIA.find((p) => p.key === m.chavePrazo)).toMatchObject({ padrao: 24 });
      expect(PARAMETROS_DE_AUDITORIA.find((p) => p.key === m.chavePct)).toMatchObject({ padrao: 10, teto: 100 });
      expect(CHAVES_DA_META.find((c) => c.key === m.chavePct)).toMatchObject({ tipo: 'PARAMETRO', componente: m.componente });
      expect(CHAVES_DA_META.find((c) => c.key === `${m.componente}_META_WEIGHT`)).toMatchObject({ tipo: 'PESO' });
      expect(CHAVES_DA_META.find((c) => c.key === `${m.componente}_META_STATUS`)).toMatchObject({ tipo: 'STATUS' });
    }
    expect(PARAMETROS_DA_AUDITORIA_OPERACIONAL).toHaveLength(8);
    expect(valorLegivel('OPAUDIT_GAS_DEADLINE_HOURS', '48')).toBe('48 h');
    expect(valorLegivel('OPAUDIT_OIL_PENALTY_PCT', '12.5')).toBe('12,5%');
    expect(moduloAuditado('gas')?.key).toBe('GAS');
    expect(moduloAuditado('x')).toBeNull();
  });
  it('as linhas extras da Configuração da Meta: uma por módulo, com a chave do COMPONENTE, e o "Fora do prazo" segue na linha do módulo', () => {
    const modules = [{ key: 'NOTES', label: 'Notas recebidas', nav: '/modulos/notas' }, { key: 'GAS', label: 'Gás', nav: '/modulos/gas' }];
    const areas = [{ id: 'operacao', titulo: 'Operação', colunas: [{ titulo: 'Controles', keys: ['NOTES', 'GAS'] }] }];
    const grupos = linhasPorModulo(modules, areas, { lateEntry: 2, notesAuditMeta: 15, gasAuditMeta: 0 }, { NOTES_AUDIT: 'MONITORAMENTO' });
    const linhas = grupos[0].linhas;
    expect(linhas.map((l) => l.key)).toEqual(['NOTES', 'NOTES_AUDIT', 'GAS', 'GAS_AUDIT']);
    expect(linhas[0]).toMatchObject({ indicador: INDICADORES.NOTES, valor: 2, status: null });
    expect(linhas[1]).toMatchObject({ indicador: INDICADORES_EXTRAS.NOTES[0].indicador, valor: 15, status: 'MONITORAMENTO' });
    expect(linhas[1].indicador?.entity).toBe('notesAuditMeta');
    expect(linhas[3]).toMatchObject({ valor: 0, status: 'ATIVO' });
  });
});

describe('janela, referência e data do fato', () => {
  it('±3 dias cruzam; 4 não', () => {
    expect(diasEntre('2026-10-31', '2026-11-03')).toBe(3);
    expect(dentroDaJanela('2026-10-31', '2026-11-03')).toBe(true);
    expect(dentroDaJanela('2026-10-30', '2026-11-03')).toBe(false);
    expect(somarDiasIso('2026-11-30', 3)).toBe('2026-12-03');
    expect(limitesDoMes('2026-02')).toEqual({ inicio: '2026-02-01', fim: '2026-02-28' });
  });
  it('a referência não distingue caixa, acento nem espaços', () => {
    expect(normalizarReferencia('  Distribuidora  AÇAÍ nº 123 ')).toBe('distribuidora acai nº 123');
  });
  it('a data do fato por módulo: nota = emissão → data efetiva → criação; gás/óleo = dia operacional; pagamento = dia do serviço → data efetiva → criação', () => {
    const criado = new Date('2026-11-04T15:00:00Z');
    expect(dataDoLancamento('NOTES', { issueDate: new Date('2026-11-01T12:00:00Z'), entryDate: new Date('2026-11-02T12:00:00Z'), createdAt: criado })).toBe('2026-11-01');
    expect(dataDoLancamento('NOTES', { entryDate: new Date('2026-11-02T12:00:00Z'), createdAt: criado })).toBe('2026-11-02');
    expect(dataDoLancamento('NOTES', { createdAt: criado })).toBe('2026-11-04');
    expect(dataDoLancamento('GAS', { operationalDate: '2026-10-29', createdAt: criado })).toBe('2026-10-29');
    expect(dataDoLancamento('OIL', { createdAt: criado })).toBe('2026-11-04');
    expect(dataDoLancamento('PAYMENTS', { workDate: new Date('2026-11-03T12:00:00Z'), createdAt: criado })).toBe('2026-11-03');
  });
});
