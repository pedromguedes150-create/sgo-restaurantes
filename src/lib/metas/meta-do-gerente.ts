import { faixaDaMeta, type Faixa } from './graficos';
import type { MetaDaUnidade } from './meta-por-usuario';

/**
 * A META NO INÍCIO DO GERENTE (v1.207.0) — o cartão "Minha Meta do Mês" passa a
 * mostrar a nota OFICIAL e o que a está derrubando.
 *
 * Pedido do Daniel (16/11/2026): "quero que essa informação seja precisa e
 * informe o gerente o que está criticando, de acordo com o que está sendo
 * considerado como meta, sem alterar a ordem do sistema".
 *
 * Antes o cartão fazia Σ pontos ÷ Σ peso por conta própria e IGNORAVA os
 * descontos (fora do prazo, gerente sem folga): podia mostrar um número
 * diferente da tela de Metas. Agora lê a `MetaDaUnidade` — o mesmo `pontuar`.
 *
 * Arquivo puro. Nenhuma fórmula nova: "pontos perdidos" é só peso × (100 − %)
 * ÷ Σ peso, a parte da nota que aquele componente deixou de entregar. A ORDEM
 * é a da tela de Metas (maior peso primeiro) — nada é reordenado por gravidade.
 */

export interface ItemDaMeta {
  key: string;
  name: string;
  weight: number;
  scorePct: number;
  done: number;
  resolved: number;
  /** Pontos da nota (0–100) que este componente deixou de entregar. */
  pontosPerdidos: number;
  faixa: Faixa;
}

export interface MetaDaUnidadeNoInicio {
  unitId: string;
  unitName: string;
  scorePct: number;
  notaAntesDosDescontos: number;
  itens: ItemDaMeta[];
  descontos: MetaDaUnidade['descontos'];
  /** Quantos componentes estão abaixo de 80% (âmbar ou vermelho). */
  abaixoDaMeta: number;
}

export interface MetaNoInicio {
  /** Nota final: a da unidade; com mais de uma, a média simples (a mesma do Uso do SGO). */
  scorePct: number;
  faixa: Faixa;
  /** Há algo medido no mês? Sem nada resolvido a nota é 0 por falta de dado, não por erro. */
  temMedicao: boolean;
  unidades: MetaDaUnidadeNoInicio[];
}

const umaCasa = (n: number) => Math.round(n * 10) / 10;

export function metaNoInicio(unidades: MetaDaUnidade[]): MetaNoInicio {
  const us = unidades.map((u) => {
    const pesoTotal = u.componentes.reduce((s, c) => s + c.weight, 0);
    const itens = u.componentes.map((c) => ({
      key: c.key, name: c.name, weight: c.weight, scorePct: c.scorePct, done: c.done, resolved: c.resolved,
      pontosPerdidos: pesoTotal ? umaCasa((c.weight * (100 - c.scorePct)) / pesoTotal) : 0,
      faixa: faixaDaMeta(c.scorePct),
    }));
    return {
      unitId: u.unitId, unitName: u.unitName, scorePct: u.scorePct, notaAntesDosDescontos: u.notaAntesDosDescontos,
      itens, descontos: u.descontos, abaixoDaMeta: itens.filter((i) => i.faixa !== 'VERDE').length,
    };
  });
  const scorePct = us.length ? Math.round(us.reduce((s, u) => s + u.scorePct, 0) / us.length) : 0;
  return { scorePct, faixa: faixaDaMeta(scorePct), temMedicao: us.some((u) => u.itens.length > 0), unidades: us };
}

export const pontosBR = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
