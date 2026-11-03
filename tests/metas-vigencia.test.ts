import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CHAVES_DA_META, COMPONENTES_DA_META, chaveDoPeso, chaveDoStatus, contaNaNota, emObservacao, lerNumero, mesesDeVigencia, motivoValido,
  normalizarStatus, rotuloDaChave, statusHerdadoDoPeso, valorLegivel, valorVigente, vigenciaValida,
} from '@/lib/metas/vigencia-regras';
import { linhasEmObservacao, pontuar, linhasDosComponentes, type ComponenteDaMeta } from '@/lib/metas/pontuacao';
import { comporMeta } from '@/lib/metas/graficos';
import { linhasPorModulo, resumirPorModulo } from '@/lib/metas/por-modulo';
import { MODULES } from '@/lib/permissions';
import { AREAS } from '@/lib/nav/areas';

/**
 * META v1.180.0 — vigência por mês e STATUS por componente, as regras puras.
 * Decisões do Pedro (03/11/2026): status e peso independentes; só ATIVO conta;
 * toda alteração tem histórico e vale a partir de um mês ≥ o corrente.
 */

const c = (key: string, weight: number, done: number, missed: number, status?: ComponenteDaMeta['status']): ComponenteDaMeta => ({ key, name: key, weight, done, missed, status });

describe('valorVigente — a entrada que vale no mês', () => {
  const hist = [
    { value: '100', validFrom: '0000-01', createdAt: '2026-11-03T10:00:00Z' },
    { value: '80', validFrom: '2026-11', createdAt: '2026-11-03T11:00:00Z' },
    { value: '60', validFrom: '2026-12', createdAt: '2026-11-03T12:00:00Z' },
  ];
  it('mês fechado lê a linha-base; o mês da mudança lê o novo; o futuro agendado só vale lá', () => {
    expect(valorVigente(hist, '2026-10')!.value).toBe('100');
    expect(valorVigente(hist, '2026-11')!.value).toBe('80');
    expect(valorVigente(hist, '2026-12')!.value).toBe('60');
    expect(valorVigente(hist, '2027-03')!.value).toBe('60');
  });
  it('duas gravações para o mesmo mês: vale a mais recente; sem nada = nulo', () => {
    const h = [...hist, { value: '70', validFrom: '2026-11', createdAt: '2026-11-04T09:00:00Z' }];
    expect(valorVigente(h, '2026-11')!.value).toBe('70');
    expect(valorVigente([], '2026-11')).toBeNull();
    expect(valorVigente([{ value: '1', validFrom: '2026-12', createdAt: '2026-11-01' }], '2026-11')).toBeNull();
  });
});

describe('vigência e motivo', () => {
  it('a vigência é um mês e nunca um período encerrado (≥ o mês corrente)', () => {
    expect(vigenciaValida('2026-11', '2026-11')).toBe(true);
    expect(vigenciaValida('2027-01', '2026-11')).toBe(true);
    expect(vigenciaValida('2026-10', '2026-11')).toBe(false);
    expect(vigenciaValida('2026-13', '2026-11')).toBe(false);
    expect(vigenciaValida('', '2026-11')).toBe(false);
    expect(vigenciaValida('2026-11-01', '2026-11')).toBe(false);
  });
  it('o seletor oferece o mês corrente e os três seguintes, virando o ano', () => {
    expect(mesesDeVigencia('2026-11')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });
  it('motivo com menos de 10 caracteres não serve', () => {
    expect(motivoValido('ok')).toBe(false);
    expect(motivoValido('   equipe treinada   ')).toBe(true);
  });
});

describe('status do componente', () => {
  it('só ATIVO conta; ausente = ativo (compatibilidade); homologação/monitoramento = observação', () => {
    expect(contaNaNota('ATIVO')).toBe(true);
    expect(contaNaNota(undefined)).toBe(true);
    expect(contaNaNota('HOMOLOGACAO')).toBe(false);
    expect(contaNaNota('MONITORAMENTO')).toBe(false);
    expect(contaNaNota('DESENVOLVIMENTO')).toBe(false);
    expect(emObservacao('HOMOLOGACAO')).toBe(true);
    expect(emObservacao('DESENVOLVIMENTO')).toBe(false);
    expect(normalizarStatus(' ativo ')).toBe('ATIVO');
    expect(normalizarStatus('ligado')).toBeNull();
  });
  it('a linha-base herda do peso: peso > 0 = Ativo, 0 = Monitoramento — e daí em diante o peso não ativa mais nada', () => {
    expect(statusHerdadoDoPeso(100)).toBe('ATIVO');
    expect(statusHerdadoDoPeso(0)).toBe('MONITORAMENTO');
  });
  it('as chaves: peso de sempre (EVALUATION_META_WEIGHT para a avaliação), status novo; todas com rótulo', () => {
    expect(chaveDoPeso('TASKS')).toBe('TASKS_META_WEIGHT');
    expect(chaveDoPeso('PEOPLE_EVALUATION')).toBe('EVALUATION_META_WEIGHT');
    expect(chaveDoStatus('STOCK')).toBe('STOCK_META_STATUS');
    expect(CHAVES_DA_META).toHaveLength(COMPONENTES_DA_META.length * 2 + 2);
    expect(rotuloDaChave('STOCK_META_STATUS')).toBe('Status — Estoque (tratativas de validade)');
    expect(valorLegivel('STOCK_META_STATUS', 'HOMOLOGACAO')).toBe('Em homologação');
    expect(valorLegivel('LATE_ENTRY_PENALTY_PCT', '2.5')).toBe('2,5%');
    expect(valorLegivel('TASKS_META_WEIGHT', null)).toBe('—');
    expect(lerNumero('7.9', 0, { inteiro: true })).toBe(7);
    expect(lerNumero('250', 2, { teto: 100 })).toBe(100);
    expect(lerNumero('x', 2)).toBe(2);
  });
});

describe('pontuar com status (status e peso independentes)', () => {
  it('peso 40 em homologação NÃO entra na nota; o mesmo componente ativo entra', () => {
    const base = c('TASKS', 50, 10, 10); // 50%
    expect(pontuar([base, c('WASTE', 40, 30, 0, 'HOMOLOGACAO')]).scorePct).toBe(50);
    expect(pontuar([base, c('WASTE', 40, 30, 0, 'MONITORAMENTO')]).scorePct).toBe(50);
    expect(pontuar([base, c('WASTE', 40, 30, 0, 'DESENVOLVIMENTO')]).scorePct).toBe(50);
    expect(pontuar([base, c('WASTE', 40, 30, 0, 'ATIVO')]).scorePct).toBe(72); // (50×50 + 40×100) ÷ 90
    expect(linhasDosComponentes([base, c('WASTE', 40, 30, 0, 'HOMOLOGACAO')]).map((l) => l.name)).toEqual(['TASKS']);
  });
  it('em observação: homologação e monitoramento com algo medido aparecem; desenvolvimento não; homologação traz a nota simulada', () => {
    const comps = [c('TASKS', 50, 10, 10, 'ATIVO'), c('WASTE', 40, 30, 0, 'HOMOLOGACAO'), c('CASH', 0, 5, 5, 'MONITORAMENTO'), c('STOCK', 10, 0, 0, 'MONITORAMENTO'), c('INVENTORY', 10, 2, 0, 'DESENVOLVIMENTO')];
    const obs = linhasEmObservacao(comps, [{ name: 'Fora do prazo', quantidade: 1, pct: 2 }]);
    expect(obs.map((o) => [o.key, o.status, o.scorePct, o.notaSeContasse])).toEqual([
      ['WASTE', 'HOMOLOGACAO', 100, 70], // (50×50 + 40×100) ÷ 90 = 72 − 2
      ['CASH', 'MONITORAMENTO', 50, null], // monitoramento não simula
    ]);
  });
});

describe('composição e tela com observação', () => {
  it('a linha OBSERVACAO fica fora da rosca e dos pontos, mesmo com peso', () => {
    const comp = comporMeta([
      { name: 'Checklists do dia', weight: 100, done: 3, resolved: 4, scorePct: 75 },
      { name: 'Treinamentos (POPs)', weight: 15, done: 1, resolved: 4, scorePct: 25, tipo: 'OBSERVACAO', status: 'MONITORAMENTO', notaSeContasse: null },
    ]);
    expect(comp.pesoTotal).toBe(100);
    expect(comp.fatias.map((f) => f.name)).toEqual(['Checklists do dia']);
    expect(comp.observacoes.map((o) => o.name)).toEqual(['Treinamentos (POPs)']);
    expect(comp.informativas).toEqual([]);
  });
  it('a lista por módulo carrega o status e o resumo só conta como "ligado" quem está Ativo com peso > 0', () => {
    const valores = { tasksMeta: 100, wasteMeta: 40, commandsMeta: 0, communication: 0, training: 15, evaluation: 0, lateEntry: 2, managerLeaveMeta: 5, cashMeta: 0, scheduleMeta: 0, cancellationsMeta: 0, stockMeta: 0, inventoryMeta: 0, utensilsMeta: 0 };
    const grupos = linhasPorModulo(MODULES, AREAS, valores, { TASKS: 'ATIVO', WASTE: 'HOMOLOGACAO', TRAINING: 'MONITORAMENTO' });
    const linhas = grupos.flatMap((g) => g.linhas);
    expect(linhas.find((l) => l.key === 'WASTE')!.status).toBe('HOMOLOGACAO');
    expect(linhas.find((l) => l.key === 'NOTES')!.status).toBeNull(); // desconto não tem status
    expect(linhas.find((l) => l.key === 'OCCURRENCES')!.status).toBeNull(); // sem indicador
    const r = resumirPorModulo(grupos);
    /* ligados: checklists (ativo, 100) + fora do prazo ×4 + escala de gerentes — desperdício 40 em homologação e treinamentos 15 em monitoramento FICAM FORA */
    expect(r.ligados).toBe(1 + 4 + 1);
    expect(r.emObservacao).toBe(2);
  });
  it('o painel de uso do supervisor usa a MESMA régua de dias decorridos da meta (dia de Brasília), não a hora do servidor', () => {
    const src = readFileSync('src/lib/supervisor/usage.ts', 'utf8');
    expect(src).toContain("import { diaEmBrasilia, diasDecorridos } from '@/lib/metas/pontuacao';");
    expect(src).toContain('diasDecorridos(yearMonth, diaEmBrasilia(new Date()))');
    expect(src).not.toContain('now.getDate()');
  });
});
