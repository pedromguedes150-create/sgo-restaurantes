import { describe, it, expect } from 'vitest';
import {
  componenteDeAtestados, conformidade, diaUtil, montarFaixas, penalizacaoDaFaixa, podeConfirmarFalha, pontosDoComponente, prazoDeLancamento,
  situacaoDoEsperado, sobrepoe, FAIXAS_PADRAO, type SituacaoDaAuditoria,
} from '@/lib/certificates/auditoria-regras';
import { pontuar, type ComponenteDaMeta } from '@/lib/metas/pontuacao';
import { CHAVES_DA_META, COMPONENTES_DA_META, PARAMETROS_DA_AUDITORIA, valorLegivel } from '@/lib/metas/vigencia-regras';

/**
 * AUDITORIA DE ATESTADOS (v1.181.0) — as regras puras. Ajustes do Pedro:
 * (1) a penalização incide sobre o PESO; (2) coletivo ≠ individual;
 * (3) só falha CONFIRMADA conta — em conferência não prejudica.
 */

const cal = { feriados: new Set(['2026-11-20']), pulaDomingo: true };
/* 2026-11-06 é sexta; 07 sábado; 08 domingo; 09 segunda. Instantes em UTC (Brasília = UTC−3). */
const sexta14h = new Date('2026-11-06T17:00:00Z'); // 14:00 em Brasília

describe('prazo em horas úteis', () => {
  it('24 horas úteis numa sexta à tarde pulam o domingo: vencem na segunda no mesmo horário', () => {
    const p = prazoDeLancamento(sexta14h, 24, cal);
    /* sex 14h → sáb 14h = 24h corridas, mas as horas do domingo não contam… só que entre sex 14h e sáb 14h não há domingo: vence sáb 14h */
    expect(p.toISOString()).toBe('2026-11-07T17:00:00.000Z');
    /* de sábado 14h, 24h úteis pulam o domingo inteiro: segunda 14h */
    expect(prazoDeLancamento(new Date('2026-11-07T17:00:00Z'), 24, cal).toISOString()).toBe('2026-11-09T17:00:00.000Z');
  });
  it('feriado cadastrado não conta; sem horas = o próprio instante', () => {
    /* 19/11 (quinta) 14h → 20/11 é feriado (pula o dia inteiro) → 21/11 (sábado) 14h */
    expect(prazoDeLancamento(new Date('2026-11-19T17:00:00Z'), 24, cal).toISOString()).toBe('2026-11-21T17:00:00.000Z');
    expect(prazoDeLancamento(sexta14h, 0, cal).toISOString()).toBe(sexta14h.toISOString());
    expect(diaUtil('2026-11-08', cal)).toBe(false);
    expect(diaUtil('2026-11-20', cal)).toBe(false);
    expect(diaUtil('2026-11-09', cal)).toBe(true);
    expect(diaUtil('2026-11-08', { feriados: new Set(), pulaDomingo: false })).toBe(true);
  });
});

describe('situação do esperado', () => {
  const prazoAte = new Date('2026-11-07T17:00:00Z');
  it('lançado até o prazo = CONFORME; depois = EM CONFERÊNCIA (não é falha até a supervisão dizer)', () => {
    expect(situacaoDoEsperado({ reviewStatus: 'AGUARDANDO', lancadoEm: new Date('2026-11-07T10:00:00Z'), prazoAte }, new Date('2026-11-10T00:00:00Z'))).toBe('CONFORME');
    expect(situacaoDoEsperado({ reviewStatus: 'AGUARDANDO', lancadoEm: new Date('2026-11-08T10:00:00Z'), prazoAte }, new Date('2026-11-10T00:00:00Z'))).toBe('EM_CONFERENCIA');
  });
  it('sem lançamento: NO_PRAZO enquanto o prazo corre, EM_CONFERENCIA depois; a decisão gravada vence os fatos', () => {
    expect(situacaoDoEsperado({ reviewStatus: 'AGUARDANDO', lancadoEm: null, prazoAte }, new Date('2026-11-07T12:00:00Z'))).toBe('NO_PRAZO');
    expect(situacaoDoEsperado({ reviewStatus: 'AGUARDANDO', lancadoEm: null, prazoAte }, new Date('2026-11-08T12:00:00Z'))).toBe('EM_CONFERENCIA');
    expect(situacaoDoEsperado({ reviewStatus: 'FALHA_CONFIRMADA', lancadoEm: null, prazoAte }, new Date('2026-11-08T12:00:00Z'))).toBe('FALHA_CONFIRMADA');
    expect(situacaoDoEsperado({ reviewStatus: 'JUSTIFICADO', lancadoEm: null, prazoAte }, new Date('2026-11-08T12:00:00Z'))).toBe('JUSTIFICADO');
    expect(situacaoDoEsperado({ reviewStatus: 'INVALIDO', lancadoEm: new Date('2026-11-07T10:00:00Z'), prazoAte }, new Date())).toBe('INVALIDO');
  });
  it('a supervisão só confirma falha com o prazo vencido e sem lançamento no prazo', () => {
    expect(podeConfirmarFalha({ reviewStatus: 'AGUARDANDO', lancadoEm: null, prazoAte }, new Date('2026-11-07T12:00:00Z'))).toBe(false);
    expect(podeConfirmarFalha({ reviewStatus: 'AGUARDANDO', lancadoEm: null, prazoAte }, new Date('2026-11-08T12:00:00Z'))).toBe(true);
    expect(podeConfirmarFalha({ reviewStatus: 'AGUARDANDO', lancadoEm: new Date('2026-11-07T10:00:00Z'), prazoAte }, new Date('2026-11-20T12:00:00Z'))).toBe(false);
    expect(podeConfirmarFalha({ reviewStatus: 'AGUARDANDO', lancadoEm: new Date('2026-11-09T10:00:00Z'), prazoAte }, new Date('2026-11-20T12:00:00Z'))).toBe(true);
  });
});

describe('conformidade e faixas (sobre o PESO)', () => {
  const s = (...xs: SituacaoDaAuditoria[]) => xs;
  it('conformidade = (conformes + justificados) ÷ decididos; em conferência, no prazo e inválidos ficam FORA; sem decididos = neutro', () => {
    const c = conformidade(s('CONFORME', 'CONFORME', 'JUSTIFICADO', 'FALHA_CONFIRMADA', 'EM_CONFERENCIA', 'NO_PRAZO', 'INVALIDO'));
    expect(c).toMatchObject({ esperados: 7, conformes: 2, justificados: 1, falhas: 1, emConferencia: 1, noPrazo: 1, invalidos: 1, base: 4, pct: 75 });
    expect(conformidade(s('EM_CONFERENCIA', 'NO_PRAZO')).pct).toBeNull();
    expect(conformidade([]).pct).toBeNull();
    expect(conformidade(s('CONFORME', 'CONFORME', 'CONFORME', 'CONFORME', 'CONFORME', 'CONFORME', 'CONFORME', 'CONFORME', 'CONFORME', 'FALHA_CONFIRMADA')).pct).toBe(90);
  });
  it('faixas: 100% nada · 90–99,9 perde 10 · 80–89,9 perde 25 · abaixo de 80 perde 50 — e as configuráveis', () => {
    expect(penalizacaoDaFaixa(100)).toBe(0);
    expect(penalizacaoDaFaixa(99.9)).toBe(10);
    expect(penalizacaoDaFaixa(90)).toBe(10);
    expect(penalizacaoDaFaixa(89.9)).toBe(25);
    expect(penalizacaoDaFaixa(80)).toBe(25);
    expect(penalizacaoDaFaixa(79.9)).toBe(50);
    expect(penalizacaoDaFaixa(0)).toBe(50);
    expect(pontosDoComponente(75)).toBe(50);
    expect(penalizacaoDaFaixa(85, montarFaixas({ pen90: 5, pen80: 15, penAbaixo80: 40 }))).toBe(15);
    expect(FAIXAS_PADRAO).toHaveLength(4);
  });
  it('o exemplo do Pedro: peso 10, conformidade abaixo de 80% → 50% de penalização → 5 pontos; o peso NÃO muda', () => {
    const c = conformidade(s('CONFORME', 'FALHA_CONFIRMADA', 'FALHA_CONFIRMADA', 'FALHA_CONFIRMADA')); // 25%
    const comp = componenteDeAtestados(c);
    expect(comp).toEqual({ done: 1, missed: 3, scorePct: 50, penalizacao: 50 });
    const atestados: ComponenteDaMeta = { key: 'CERTIFICATES', name: 'Atestados', weight: 10, status: 'ATIVO', ...comp };
    const checklists: ComponenteDaMeta = { key: 'TASKS', name: 'Checklists', weight: 90, done: 90, missed: 0 };
    const p = pontuar([checklists, atestados]);
    expect(p.resolvedWeight).toBe(100);
    expect(p.doneWeight).toBeCloseTo(95, 5); // 90 + 10 × 50% = 95 — os 5 pontos conquistados dos 10 possíveis
    expect(p.scorePct).toBe(95);
    /* 100% de conformidade = peso inteiro */
    expect(pontuar([checklists, { ...atestados, ...componenteDeAtestados(conformidade(s('CONFORME', 'CONFORME'))) }]).scorePct).toBe(100);
  });
  it('mês sem decisão = neutro: 0/0 fica fora da conta e não puxa a nota', () => {
    const comp = componenteDeAtestados(conformidade(s('EM_CONFERENCIA', 'NO_PRAZO')));
    expect(comp).toEqual({ done: 0, missed: 0, scorePct: 0, penalizacao: 0 });
    const p = pontuar([{ key: 'TASKS', name: 'Checklists', weight: 90, done: 45, missed: 45 }, { key: 'CERTIFICATES', name: 'Atestados', weight: 10, status: 'ATIVO', ...comp }]);
    expect(p.scorePct).toBe(50);
    expect(p.resolvedWeight).toBe(90);
  });
  it('componente em Monitoramento com dados não entra, mesmo com peso (status e peso independentes)', () => {
    const comp = componenteDeAtestados(conformidade(s('FALHA_CONFIRMADA', 'FALHA_CONFIRMADA')));
    expect(pontuar([{ key: 'TASKS', name: 'Checklists', weight: 90, done: 90, missed: 0 }, { key: 'CERTIFICATES', name: 'Atestados', weight: 10, status: 'MONITORAMENTO', ...comp }]).scorePct).toBe(100);
  });
});

describe('cruzamento e registro de chaves', () => {
  it('períodos que se tocam', () => {
    expect(sobrepoe({ startDate: '2026-11-03', endDate: '2026-11-05' }, { startDate: '2026-11-05', endDate: '2026-11-07' })).toBe(true);
    expect(sobrepoe({ startDate: '2026-11-03', endDate: '2026-11-05' }, { startDate: '2026-11-06', endDate: '2026-11-07' })).toBe(false);
  });
  it('o 13º componente e os quatro parâmetros estão no registro da vigência, com rótulo legível', () => {
    expect(COMPONENTES_DA_META.find((c) => c.key === 'CERTIFICATES')).toMatchObject({ pesoPadrao: 0 });
    expect(PARAMETROS_DA_AUDITORIA.map((p) => [p.key, p.padrao])).toEqual([['CERT_AUDIT_DEADLINE_HOURS', 24], ['CERT_AUDIT_PENALTY_90', 10], ['CERT_AUDIT_PENALTY_80', 25], ['CERT_AUDIT_PENALTY_UNDER80', 50]]);
    expect(CHAVES_DA_META.filter((c) => c.tipo === 'PARAMETRO' && c.componente === 'CERTIFICATES')).toHaveLength(4);
    expect(valorLegivel('CERT_AUDIT_DEADLINE_HOURS', '24')).toBe('24 h');
    expect(valorLegivel('CERT_AUDIT_PENALTY_80', '25')).toBe('25%');
  });
});
