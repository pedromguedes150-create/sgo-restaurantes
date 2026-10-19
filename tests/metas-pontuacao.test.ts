import { describe, it, expect } from 'vitest';
import { pontuar, linhasDosComponentes, diasDecorridos, cobertura, diasDistintosNoMes, diaEmBrasilia, type ComponenteDaMeta } from '@/lib/metas/pontuacao';
import { inicioDaFaixa, somarDias, faixaDaValidade } from '@/lib/stock/validade';
import { comporMeta } from '@/lib/metas/graficos';

/**
 * META v1.174.0 — a conta PURA: checklists com UM peso (cada um vale igual),
 * componente sem nada a fazer fica fora, descontos direto na nota.
 */

const c = (key: string, weight: number, done: number, missed: number): ComponenteDaMeta => ({ key, name: key, weight, done, missed });

describe('pontuar', () => {
  it('checklists com peso único: cada instância vale igual — 3 feitas de 4 = 75%, não importa o peso que cada checklist tinha antes', () => {
    expect(pontuar([c('TASKS', 100, 3, 1)]).scorePct).toBe(75);
    /* a mesma proporção com peso 7 dá o mesmo 75%: o peso só pesa CONTRA os outros componentes */
    expect(pontuar([c('TASKS', 7, 3, 1)]).scorePct).toBe(75);
  });

  it('componente com peso 0 ou sem nada resolvido no mês fica FORA (não é zero, é ausência)', () => {
    const base = [c('TASKS', 100, 3, 1)];
    expect(pontuar([...base, c('CANCELLATIONS', 50, 0, 0)]).scorePct).toBe(75);
    expect(pontuar([...base, c('CANCELLATIONS', 0, 0, 5)]).scorePct).toBe(75);
    expect(pontuar([c('CANCELLATIONS', 0, 0, 0)]).scorePct).toBe(0);
  });

  it('composição: Σ(peso × %) ÷ Σ(peso) — checklists 100 a 75% e cofre 50 a 100% = 83%', () => {
    const p = pontuar([c('TASKS', 100, 3, 1), c('CASH', 50, 20, 0)]);
    expect(p.resolvedWeight).toBe(150);
    expect(p.doneWeight).toBeCloseTo(125, 5);
    expect(p.scorePct).toBe(83);
  });

  it('descontos tiram direto da nota, por ocorrência, e a nota não fica negativa', () => {
    const comps = [c('TASKS', 100, 9, 1)];
    expect(pontuar(comps, [{ name: 'Fora do prazo', quantidade: 2, pct: 2 }]).scorePct).toBe(86);
    expect(pontuar(comps, [{ name: 'Escala de gerentes', quantidade: 2, pct: 5 }, { name: 'Fora do prazo', quantidade: 1, pct: 2 }]).scorePct).toBe(78);
    expect(pontuar(comps, [{ name: 'x', quantidade: 100, pct: 5 }]).scorePct).toBe(0);
    /* quantidade 0 ou pct 0 não mexem */
    expect(pontuar(comps, [{ name: 'x', quantidade: 0, pct: 5 }, { name: 'y', quantidade: 3, pct: 0 }]).scorePct).toBe(90);
  });

  it('linhas do detalhamento: só o que pesou, do maior peso para o menor, com % arredondado', () => {
    const linhas = linhasDosComponentes([c('CASH', 20, 1, 1), c('TASKS', 100, 3, 1), c('STOCK', 30, 0, 0), c('WASTE', 0, 10, 0)]);
    expect(linhas.map((l) => l.name)).toEqual(['TASKS', 'CASH']);
    expect(linhas[0]).toEqual({ name: 'TASKS', weight: 100, done: 3, resolved: 4, scorePct: 75 });
  });
});

describe('dias decorridos e cobertura', () => {
  it('mês corrente conta até ONTEM; mês passado inteiro; mês FUTURO zero (antes devolvia o mês inteiro)', () => {
    expect(diasDecorridos('2026-10', '2026-10-19')).toBe(18);
    expect(diasDecorridos('2026-10', '2026-10-01')).toBe(0);
    expect(diasDecorridos('2026-09', '2026-10-19')).toBe(30);
    expect(diasDecorridos('2026-02', '2026-10-19')).toBe(28);
    expect(diasDecorridos('2026-11', '2026-10-19')).toBe(0);
    expect(diasDecorridos('2027-01', '2026-10-19')).toBe(0);
  });

  it('cobertura: done nunca passa dos dias decorridos (mês preenchido adiantado não rende mais que 100%)', () => {
    expect(cobertura(12, 18)).toEqual({ done: 12, missed: 6 });
    expect(cobertura(31, 18)).toEqual({ done: 18, missed: 0 });
    expect(cobertura(0, 0)).toEqual({ done: 0, missed: 0 });
  });

  it('dias distintos no mês: repetidos contam uma vez, fora do mês e depois de hoje ficam fora', () => {
    const dias = ['2026-10-03', '2026-10-03', '2026-10-05', '2026-10-25', '2026-09-30'];
    expect(diasDistintosNoMes(dias, '2026-10', 18)).toBe(2);
    expect(diasDistintosNoMes(dias, '2026-10', 31)).toBe(3);
  });

  it('dia em Brasília: 02h30 UTC do dia 20 ainda é dia 19', () => {
    expect(diaEmBrasilia(new Date('2026-10-20T02:30:00Z'))).toBe('2026-10-19');
    expect(diaEmBrasilia(new Date('2026-10-20T03:30:00Z'))).toBe('2026-10-20');
  });
});

describe('estoque: o dia em que o lote entrou na faixa atual', () => {
  it('a escalada fixa dá a data de entrada em cada faixa; PROXIMO usa a janela do produto', () => {
    expect(somarDias('2026-10-31', 1)).toBe('2026-11-01');
    expect(inicioDaFaixa('2026-10-10', 'VENCIDO')).toBe('2026-10-11');
    expect(inicioDaFaixa('2026-10-10', 'HOJE')).toBe('2026-10-10');
    expect(inicioDaFaixa('2026-10-10', 'CRITICO')).toBe('2026-10-08');
    expect(inicioDaFaixa('2026-10-10', 'ATENCAO')).toBe('2026-10-03');
    expect(inicioDaFaixa('2026-10-10', 'PROXIMO', 30)).toBe('2026-09-10');
  });

  it('a entrada calculada é coerente com a faixa calculada: no dia da entrada o lote já está na faixa; na véspera ainda não', () => {
    for (const chave of ['VENCIDO', 'HOJE', 'CRITICO', 'ATENCAO', 'PROXIMO'] as const) {
      const ini = inicioDaFaixa('2026-10-10', chave, 30);
      expect(faixaDaValidade('2026-10-10', ini, 30)?.chave, chave).toBe(chave);
      expect(faixaDaValidade('2026-10-10', somarDias(ini, -1), 30)?.chave, chave).not.toBe(chave);
    }
  });
});

describe('composição com detalhe por checklist', () => {
  it('as linhas DETALHE não pesam, não entram na rosca nem nas informativas — vão para `detalhes`', () => {
    const c = comporMeta([
      { name: 'Checklists do dia', weight: 100, done: 3, resolved: 4, scorePct: 75 },
      { name: 'Abertura', weight: 0, done: 2, resolved: 3, scorePct: 67, tipo: 'DETALHE' },
      { name: 'Fechamento', weight: 0, done: 1, resolved: 1, scorePct: 100, tipo: 'DETALHE' },
      { name: 'Fora do prazo (−2% na meta)', weight: 0, done: 0, resolved: 1, scorePct: 0, tipo: 'DESCONTO' },
    ]);
    expect(c.fatias.map((f) => f.name)).toEqual(['Checklists do dia']);
    expect(c.detalhes.map((d) => d.name)).toEqual(['Abertura', 'Fechamento']);
    expect(c.informativas.map((l) => l.name)).toEqual(['Fora do prazo (−2% na meta)']);
    expect(c.tarefas).toEqual({ done: 3, missed: 1, resolved: 4, pct: 75 });
  });
});
