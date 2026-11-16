import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { metaNoInicio } from '@/lib/metas/meta-do-gerente';
import { metaDaUnidade } from '@/lib/metas/meta-por-usuario';
import { pontuar, type ComponenteDaMeta, type DescontoDaMeta } from '@/lib/metas/pontuacao';

/** v1.207.0 — o cartão "Minha Meta do Mês" mostra a nota oficial e o que a derruba. */

const comp = (key: string, weight: number, done: number, missed: number, o: Partial<ComponenteDaMeta> = {}): ComponenteDaMeta =>
  ({ key, name: key, weight, done, missed, ...o }) as ComponenteDaMeta;

describe('metaNoInicio', () => {
  const componentes = [comp('WASTE', 40, 5, 5), comp('TASKS', 50, 9, 1), comp('SCHEDULE', 10, 1, 0), comp('STOCK', 0, 0, 4)];
  const descontos: DescontoDaMeta[] = [{ name: 'Fora do prazo', quantidade: 2, pct: 2.5, detalhe: '2 datas corrigidas' }];

  it('a nota é a OFICIAL (com descontos), igual à de pontuar', () => {
    const m = metaNoInicio([metaDaUnidade('u1', 'Unidade 1', componentes, descontos)]);
    expect(m.scorePct).toBe(pontuar(componentes, descontos).scorePct);
    expect(m.scorePct).toBe(70); // 75 − 5
    expect(m.unidades[0].notaAntesDosDescontos).toBe(75);
    expect(m.faixa).toBe('AMBAR');
  });

  it('itens na ordem da tela de Metas (maior peso primeiro), só o que pesa, com os pontos que cada um tira', () => {
    const u = metaNoInicio([metaDaUnidade('u1', 'Unidade 1', componentes, descontos)]).unidades[0];
    expect(u.itens.map((i) => i.key)).toEqual(['TASKS', 'WASTE', 'SCHEDULE']);
    expect(u.itens.map((i) => i.pontosPerdidos)).toEqual([5, 20, 0]);
    expect(u.itens.map((i) => i.faixa)).toEqual(['VERDE', 'AMBAR', 'VERDE']);
    expect(u.abaixoDaMeta).toBe(1);
    // nota antes dos descontos + pontos perdidos = 100
    expect(u.notaAntesDosDescontos + u.itens.reduce((s, i) => s + i.pontosPerdidos, 0)).toBe(100);
    expect(u.descontos).toEqual([{ name: 'Fora do prazo', quantidade: 2, pct: 2.5, total: 5, detalhe: '2 datas corrigidas' }]);
  });

  it('mais de uma unidade: média simples das notas; sem nada medido não inventa item', () => {
    const a = metaDaUnidade('a', 'A', [comp('TASKS', 100, 9, 1)], []);
    const b = metaDaUnidade('b', 'B', [comp('TASKS', 100, 3, 7)], []);
    const m = metaNoInicio([a, b]);
    expect(m.scorePct).toBe(60);
    expect(m.unidades.map((u) => u.scorePct)).toEqual([90, 30]);
    const vazio = metaNoInicio([metaDaUnidade('c', 'C', [comp('TASKS', 100, 0, 0)], [])]);
    expect(vazio.temMedicao).toBe(false);
    expect(vazio.unidades[0].itens).toEqual([]);
    expect(metaNoInicio([]).scorePct).toBe(0);
  });
});

describe('telas', () => {
  it('o Início do gerente não refaz a conta da meta por fora', () => {
    const src = readFileSync('src/app/(app)/dashboard/page.tsx', 'utf8');
    expect(src).toContain('metaNoInicio(');
    expect(src).not.toContain('monthScore.doneWeight');
  });
  it('a descrição do reembolso quebra linha dentro da célula', () => {
    const src = readFileSync('src/components/payments/reembolsos-client.tsx', 'utf8');
    expect(src).toMatch(/descricao-reembolso/);
    expect(src).toMatch(/max-w-md whitespace-normal break-words/);
  });
});
