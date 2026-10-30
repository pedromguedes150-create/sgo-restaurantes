import { pontuar, type ComponenteDaMeta, type DescontoDaMeta } from './pontuacao';

/**
 * META POR USUÁRIO (v1.179.0) — a nota da bonificação, pessoa por pessoa, SEM
 * segunda fórmula.
 *
 * Pedido do Pedro (30/10/2026): "defino desperdício peso 40, checklist 50,
 * escala 10; o gerente fez 50%, 50% e 100% — de 100% que poderia ser a
 * comissão dele, será X%". Essa conta já existe: é a nota da META da unidade
 * (`pontuar`: Σ peso × % ÷ Σ peso, menos os descontos). O que faltava era
 * mostrá-la por USUÁRIO, componente a componente.
 *
 * DECISÃO (Pedro, 30/10): a nota é da UNIDADE e cada gerente HERDA a nota da
 * unidade que cuida — quem cuida de mais de uma recebe a MÉDIA. O SGO sabe
 * quem lançou cada coisa, mas não sabe quem estava de plantão no dia em que
 * ninguém lançou; uma nota individual de desperdício/comandas puniria quem
 * trabalhou menos dias. O que é individual de verdade (tarefas concluídas
 * pelo próprio usuário, a própria folga) aparece AO LADO, não dentro da nota.
 *
 * Arquivo puro: nada de banco. `uso.ts` monta as `MetaDaUnidade` com os
 * mesmos `componentesDaMeta`/`descontosDaMeta` que dão a nota da unidade.
 */

export interface ComponenteDaNota {
  key: string;
  name: string;
  weight: number;
  done: number;
  resolved: number;
  /** % alcançado no componente (feito ÷ devido). */
  scorePct: number;
}

export interface DescontoDaNota {
  name: string;
  quantidade: number;
  pct: number;
  /** Pontos tirados da nota: quantidade × pct. */
  total: number;
}

export interface MetaDaUnidade {
  unitId: string;
  unitName: string;
  /** A nota da unidade — a MESMA de Metas e do painel do supervisor. */
  scorePct: number;
  /** Nota antes dos descontos (Σ peso × % ÷ Σ peso). */
  notaAntesDosDescontos: number;
  /** Só o que pesou: peso > 0 e algo resolvido no mês. */
  componentes: ComponenteDaNota[];
  descontos: DescontoDaNota[];
}

export interface PesoDaMeta { key: string; name: string; weight: number }

export interface MetaDoUsuario {
  /** A nota final: média simples das notas das unidades do usuário. */
  scorePct: number;
  notaAntesDosDescontos: number;
  /** Pontos tirados pelos descontos (média entre as unidades). */
  descontoTotal: number;
  /** Por componente, a média do % entre as unidades que o pontuaram; `scorePct` nulo = ninguém pontuou. */
  componentes: { key: string; name: string; weight: number; scorePct: number | null }[];
  unidades: { unitId: string; unitName: string; scorePct: number }[];
}

/** A nota de uma unidade aberta em componentes e descontos — o mesmo `pontuar` da meta. */
export function metaDaUnidade(unitId: string, unitName: string, componentes: ComponenteDaMeta[], descontos: DescontoDaMeta[]): MetaDaUnidade {
  const semDescontos = pontuar(componentes, []);
  const comDescontos = pontuar(componentes, descontos);
  return {
    unitId,
    unitName,
    scorePct: comDescontos.scorePct,
    notaAntesDosDescontos: semDescontos.scorePct,
    componentes: componentes
      .filter((c) => c.weight > 0 && c.done + c.missed > 0)
      .map((c) => ({ key: c.key, name: c.name, weight: c.weight, done: c.done, resolved: c.done + c.missed, scorePct: Math.round((c.done / (c.done + c.missed)) * 100) }))
      .sort((a, b) => b.weight - a.weight),
    descontos: descontos
      .filter((d) => d.quantidade > 0 && d.pct > 0)
      .map((d) => ({ name: d.name, quantidade: d.quantidade, pct: d.pct, total: Math.round(d.quantidade * d.pct) })),
  };
}

const media = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0);

/**
 * A nota do usuário a partir das unidades que ele cuida. Sem unidade → nulo
 * (não é zero: a pessoa não tem o que ser medido).
 *
 * `pesos` é a lista de componentes em vigor (peso > 0): entra na saída mesmo
 * quando nenhuma unidade pontuou — a coluna aparece com "—", para o quadro
 * dizer o que a meta cobra e o que ainda não foi medido.
 */
export function metaDoUsuario(unidades: MetaDaUnidade[], pesos: PesoDaMeta[]): MetaDoUsuario | null {
  if (unidades.length === 0) return null;
  const componentes = pesos
    .filter((p) => p.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .map((p) => {
      const pcts = unidades.map((u) => u.componentes.find((c) => c.key === p.key)?.scorePct).filter((x): x is number => x != null);
      return { key: p.key, name: p.name, weight: p.weight, scorePct: pcts.length ? media(pcts) : null };
    });
  const notaAntes = media(unidades.map((u) => u.notaAntesDosDescontos));
  const nota = media(unidades.map((u) => u.scorePct));
  return {
    scorePct: nota,
    notaAntesDosDescontos: notaAntes,
    descontoTotal: Math.max(0, notaAntes - nota),
    componentes,
    unidades: unidades.map((u) => ({ unitId: u.unitId, unitName: u.unitName, scorePct: u.scorePct })),
  };
}

/** Rótulos curtos para o cabeçalho do quadro (o nome completo fica no título da coluna). */
export const ROTULO_CURTO_DO_COMPONENTE: Record<string, string> = {
  TASKS: 'Checklists', TRAINING: 'Treinamentos', COMMUNICATION: 'Comunicados', PEOPLE_EVALUATION: 'Avaliações',
  WASTE: 'Desperdício', COMMANDS: 'Comandas', CASH: 'Cofre', SCHEDULE: 'Escala', CANCELLATIONS: 'Cancelamentos',
  STOCK: 'Estoque', INVENTORY: 'Inventário', UTENSILS: 'Utensílios',
};
export const rotuloCurto = (key: string, name: string) => ROTULO_CURTO_DO_COMPONENTE[key] ?? name;

/**
 * A conta por extenso, para a pessoa conferir sem calculadora:
 * "Checklists 50 × 50% + Desperdício 40 × 50% ÷ 90 = 50% · descontos −5 = 45%".
 */
export function explicarNota(m: MetaDoUsuario): string {
  const pesando = m.componentes.filter((c) => c.scorePct != null) as { key: string; name: string; weight: number; scorePct: number }[];
  if (pesando.length === 0) return 'Nenhum componente com peso teve algo a medir no mês.';
  const soma = pesando.reduce((s, c) => s + c.weight, 0);
  const termos = pesando.map((c) => `${rotuloCurto(c.key, c.name)} ${c.weight} × ${c.scorePct}%`).join(' + ');
  const desconto = m.descontoTotal > 0 ? ` · descontos −${m.descontoTotal} = ${m.scorePct}%` : '';
  const varias = m.unidades.length > 1 ? ` (média de ${m.unidades.length} unidades)` : '';
  return `${termos} ÷ ${soma} = ${m.notaAntesDosDescontos}%${desconto}${varias}`;
}
