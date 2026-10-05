import { describe, it, expect } from 'vitest';
import {
  dataBR, diasDoMes, direcao, lancadoDepois, mapaDeLancamentos, porDiaDaSemana, porParte, porUnidade,
  resumir, serieDiaria, situacaoDaFoto, tendenciaMensal, variacaoDaMedia, type RegistroDia,
} from '@/lib/waste/painel-calculo';
import { procedimentosSemFoto, urlDoUpload } from '@/lib/waste/foto-regra';

/**
 * Painel de desperdício (v1.152.0) — Conferência e Performance. O que se trava:
 * a comparação é pela MÉDIA POR DIA LANÇADO (lançar menos dias não é
 * desperdiçar menos), a foto é avaliada por procedimento, e o endereço da foto
 * é o que o servidor serve de verdade.
 */
const reg = (unitId: string, date: string, total: number, partes: Record<string, number> = {}, motivos?: Record<string, number>): RegistroDia => ({ unitId, date, total, partes, motivos });

describe('endereço da foto', () => {
  it('é /uploads/… (a rota que existe) — nunca /api/uploads/…', () => {
    expect(urlDoUpload('uploads/u1/snack-2026-09-30.jpg')).toBe('/uploads/u1/snack-2026-09-30.jpg');
    expect(urlDoUpload('/uploads/u1/a.jpg')).toBe('/uploads/u1/a.jpg');
    expect(urlDoUpload('uploads/u1/a.jpg')).not.toContain('/api/');
  });
});

describe('foto por procedimento', () => {
  it('lista só os procedimentos com peso que ficaram sem foto', () => {
    expect(procedimentosSemFoto(['SS_ALMOCO', 'PROD_JANTAR'], ['SS_ALMOCO'])).toEqual(['PROD_JANTAR']);
    expect(procedimentosSemFoto([], [])).toEqual([]);
  });
  it('situação: completa, parcial, sem foto e sem peso', () => {
    expect(situacaoDaFoto(['A', 'B'], ['A', 'B'])).toBe('completa');
    expect(situacaoDaFoto(['A', 'B'], ['A'])).toBe('parcial');
    expect(situacaoDaFoto(['A'], [])).toBe('sem-foto');
    expect(situacaoDaFoto([], [])).toBe('sem-peso');
  });
});

describe('performance — média por dia lançado', () => {
  it('lançar menos dias NÃO é desperdiçar menos: a seta vem da média', () => {
    // setembro: 20 lançamentos de 10 kg = 200 kg; outubro: 5 lançamentos de 12 kg = 60 kg
    const set = Array.from({ length: 20 }, (_, i) => reg('u1', `2026-09-${String(i + 1).padStart(2, '0')}`, 10));
    const out = Array.from({ length: 5 }, (_, i) => reg('u1', `2026-10-${String(i + 1).padStart(2, '0')}`, 12));
    const a = resumir(out), b = resumir(set);
    expect(a.total).toBeLessThan(b.total); // o total "caiu"…
    const v = variacaoDaMedia(a, b);
    expect(v).toBeCloseTo(20); // …mas a média por dia SUBIU 20%
    expect(direcao(v)).toBe('subiu');
  });
  it('sem base no mês anterior = "sem-base", e |v| < 5% = estável', () => {
    expect(variacaoDaMedia(resumir([reg('u1', '2026-10-01', 5)]), resumir([]))).toBeNull();
    expect(direcao(null)).toBe('sem-base');
    expect(direcao(3)).toBe('estavel');
    expect(direcao(-12)).toBe('caiu');
  });
  it('por unidade: maior alta primeiro', () => {
    const atual = [reg('a', '2026-10-01', 15), reg('b', '2026-10-01', 8)];
    const ant = [reg('a', '2026-09-01', 10), reg('b', '2026-09-01', 10)];
    const l = porUnidade(atual, ant, [{ id: 'b', name: 'B' }, { id: 'a', name: 'A' }]);
    expect(l.map((x) => x.unitId)).toEqual(['a', 'b']);
    expect(l[0].direcao).toBe('subiu');
    expect(l[1].direcao).toBe('caiu');
  });
  it('por tipo: normalizado pelos dias lançados de cada mês', () => {
    const atual = [reg('u', '2026-10-01', 4, { Coxinha: 4 })];
    const ant = [reg('u', '2026-09-01', 4, { Coxinha: 4 }), reg('u', '2026-09-02', 4, { Coxinha: 4 })];
    const [cox] = porParte(atual, ant);
    expect(cox.atual).toBe(4);
    expect(cox.anterior).toBe(8);
    expect(cox.variacao).toBeCloseTo(0); // 4/dia nos dois meses
    expect(cox.direcao).toBe('estavel');
  });
  it('por motivo usa o campo motivos', () => {
    const [m] = porParte([reg('u', '2026-10-01', 3, {}, { 'Sobra do dia': 3 })], [], 'motivos');
    expect(m.chave).toBe('Sobra do dia');
    expect(m.participacao).toBe(100);
  });
  it('série diária: dia sem lançamento fica com 0 lançamentos (não some)', () => {
    const s = serieDiaria([reg('a', '2026-10-02', 3), reg('b', '2026-10-02', 2)], ['2026-10-01', '2026-10-02']);
    expect(s).toEqual([{ date: '2026-10-01', total: 0, lancamentos: 0 }, { date: '2026-10-02', total: 5, lancamentos: 2 }]);
  });
  it('dia da semana começa na segunda', () => {
    const w = porDiaDaSemana([reg('u', '2026-10-05', 6)]); // 05/10/2026 é segunda
    expect(w[0]).toEqual({ dia: 'Segunda', lancamentos: 1, media: 6 });
    expect(w[6].dia).toBe('Domingo');
  });
  it('tendência mensal: um ponto por mês, do mais antigo ao atual', () => {
    const t = tendenciaMensal([reg('u', '2026-09-10', 4), reg('u', '2026-10-01', 6)], 2026, 10, 3);
    expect(t.map((x) => x.ym)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(t[0].lancamentos).toBe(0);
    expect(t[2].media).toBe(6);
  });
});

describe('conferência', () => {
  it('dias do mês só até hoje; mês futuro = nenhum', () => {
    expect(diasDoMes(2026, 10, '2026-10-03')).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(diasDoMes(2026, 9, '2026-10-03')).toHaveLength(30);
    expect(diasDoMes(2026, 11, '2026-10-03')).toEqual([]);
  });
  it('lançado depois: madrugada do dia seguinte ainda é "no dia"; dois dias depois, não', () => {
    expect(lancadoDepois('2026-10-01', '2026-10-02')).toBe(false);
    expect(lancadoDepois('2026-10-01', '2026-10-03')).toBe(true);
  });
  it('mapa unidade × dia marca o que existe e deixa null o que não foi lançado', () => {
    const m = mapaDeLancamentos([{ id: 'a', name: 'A' }], ['2026-10-01', '2026-10-02'], [{ unitId: 'a', date: '2026-10-02', foto: 'sem-foto' }]);
    expect(m[0].dias).toEqual([null, 'sem-foto']);
    expect(m[0].lancados).toBe(1);
  });
  it('data em dd/mm/aaaa', () => {
    expect(dataBR('2026-09-30')).toBe('30/09/2026');
  });
});
