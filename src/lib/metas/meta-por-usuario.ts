import { contaNaNota, pctDoComponente, pontuar, type ComponenteDaMeta, type DescontoDaMeta } from './pontuacao';
import { aplicarIndividuais, individuaisDoGerente, semHorario, type FatosDaUnidade, type ResultadoIndividual } from './nota-individual';

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
 * v1.214.0 (Daniel, 18/11) — DESCONTO COM DONO: o desconto da Escala de
 * gerentes ("sem folga cadastrada") é de quem não cadastrou. Na nota da
 * UNIDADE nada muda (segue descontando por gerente sem folga); na nota de cada
 * PESSOA ele só atinge quem está sem folga — antes os quatro gerentes do
 * Vivendas perdiam 5 pontos porque um deles não tinha lançado. Os componentes
 * com peso seguem herdados da unidade (o passo seguinte, individual por
 * plantão/autoria, é proposta em aberto).
 *
 * v1.215.0 (Daniel, 18/11) — NOTA INDIVIDUAL: com os fatos do mês
 * (`nota-individual.ts`), checklists, desperdício, comandas e cofre entram
 * pelos DIAS DE PLANTÃO do gerente (com participação mínima) e comunicados
 * pelas confirmações dele. Os pesos são os mesmos; os demais componentes
 * seguem os da unidade. Oficial em dezembro/2026; novembro é simulação.
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
  /** v1.215.0 — só na nota individual: como o % desta pessoa foi medido. */
  individual?: ResultadoIndividual;
}

export interface DescontoDaNota {
  name: string;
  quantidade: number;
  pct: number;
  /** Pontos tirados da nota: quantidade × pct. */
  total: number;
  /** v1.180.0 — o que descontou, nomeado. */
  detalhe?: string;
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
  /** v1.214.0 — a nota só com os descontos da unidade (sem os que têm dono). */
  notaSemIndividuais?: number;
  /** v1.214.0 — os descontos que têm dono: nome, % e quem. */
  descontosIndividuais?: { name: string; pct: number; userIds: string[] }[];
  /** v1.215.0 — as listas de origem, para refazer a MESMA conta com os componentes da pessoa. */
  base?: { componentes: ComponenteDaMeta[]; descontos: DescontoDaMeta[] };
  /** v1.215.0 — a pessoa não tem horário cadastrado na Escala de gerentes (foi tratada como de plantão todo dia). */
  semHorario?: boolean;
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
  /** v1.180.0 — os descontos NOMEADOS, unidade por unidade (quem está sem folga, quantas datas corrigidas). */
  descontos: { unitName: string; name: string; quantidade: number; pct: number; total: number; detalhe?: string }[];
  /** v1.215.0 — os componentes medidos pela pessoa, unidade por unidade (vazio na nota herdada). */
  individuais?: { unitName: string; key: string; name: string; r: ResultadoIndividual }[];
  semHorario?: boolean;
}

/** A nota de uma unidade aberta em componentes e descontos — o mesmo `pontuar` da meta. */
export function metaDaUnidade(unitId: string, unitName: string, componentes: ComponenteDaMeta[], descontos: DescontoDaMeta[]): MetaDaUnidade {
  const semDescontos = pontuar(componentes, []);
  const comDescontos = pontuar(componentes, descontos);
  const comDono = descontos.filter((d) => d.individual && d.pct > 0);
  return {
    base: { componentes, descontos },
    notaSemIndividuais: pontuar(componentes, descontos.filter((d) => !d.individual)).scorePct,
    descontosIndividuais: comDono.map((d) => ({ name: d.name, pct: d.pct, userIds: d.individual!.userIds })),
    unitId,
    unitName,
    scorePct: comDescontos.scorePct,
    notaAntesDosDescontos: semDescontos.scorePct,
    componentes: componentes
      .filter((c) => contaNaNota(c) && c.weight > 0 && c.done + c.missed > 0)
      .map((c) => ({ key: c.key, name: c.name, weight: c.weight, done: c.done, resolved: c.done + c.missed, scorePct: pctDoComponente(c) }))
      .sort((a, b) => b.weight - a.weight),
    descontos: descontos
      .filter((d) => d.quantidade > 0 && d.pct > 0)
      .map((d) => ({ name: d.name, quantidade: d.quantidade, pct: d.pct, total: Math.round(d.quantidade * d.pct), detalhe: d.detalhe })),
  };
}

/**
 * v1.214.0 — a mesma unidade vista por UMA pessoa: os descontos com dono só
 * entram se ela for a dona. Unidade montada sem essa informação (versão
 * anterior, teste) volta como está.
 */
export function metaDaUnidadeDoUsuario(u: MetaDaUnidade, userId: string): MetaDaUnidade {
  if (u.notaSemIndividuais == null || !u.descontosIndividuais) return u;
  const nomes = new Set(u.descontosIndividuais.map((d) => d.name));
  const meus = u.descontosIndividuais.filter((d) => d.userIds.includes(userId));
  const scorePct = Math.max(0, Math.round(meus.reduce((nota, d) => nota - d.pct, u.notaSemIndividuais)));
  return {
    ...u,
    scorePct,
    descontos: [
      ...u.descontos.filter((d) => !nomes.has(d.name)),
      ...meus.map((d) => ({ name: d.name, quantidade: 1, pct: d.pct, total: Math.round(d.pct), detalhe: 'você está sem folga cadastrada no mês' })),
    ],
  };
}

/**
 * v1.215.0 — a unidade vista por UM gerente com a NOTA INDIVIDUAL: os
 * componentes individuais saem dos fatos dele, os demais e os pesos ficam
 * como estão, e a conta é o mesmo `pontuar`. Sem as listas de origem, ou se
 * a pessoa não é gerente da unidade, cai na nota herdada (v1.214.0).
 */
export function metaIndividualDaUnidade(u: MetaDaUnidade, userId: string, fatos: FatosDaUnidade | undefined): MetaDaUnidade {
  const ind = fatos ? individuaisDoGerente(fatos, userId) : null;
  if (!u.base || !fatos || !ind) return metaDaUnidadeDoUsuario(u, userId);
  const descontos = u.base.descontos.map((d) => {
    if (!d.individual) return d;
    const meu = d.individual.userIds.includes(userId);
    return { name: d.name, pct: d.pct, quantidade: meu ? 1 : 0, detalhe: meu ? 'você está sem folga cadastrada no mês' : undefined };
  });
  const m = metaDaUnidade(u.unitId, u.unitName, aplicarIndividuais(u.base.componentes, ind), descontos);
  return {
    ...m,
    semHorario: semHorario(fatos, userId),
    componentes: m.componentes.map((c) => (ind[c.key] ? { ...c, individual: ind[c.key]! } : c)),
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
    descontos: unidades.flatMap((u) => u.descontos.map((d) => ({ unitName: u.unitName, ...d }))),
    individuais: unidades.flatMap((u) => u.componentes.filter((c) => c.individual).map((c) => ({ unitName: u.unitName, key: c.key, name: c.name, r: c.individual! }))),
    semHorario: unidades.some((u) => u.semHorario),
  };
}

/** Rótulos curtos para o cabeçalho do quadro (o nome completo fica no título da coluna). */
export const ROTULO_CURTO_DO_COMPONENTE: Record<string, string> = {
  TASKS: 'Checklists', TRAINING: 'Treinamentos', COMMUNICATION: 'Comunicados', PEOPLE_EVALUATION: 'Avaliações',
  WASTE: 'Desperdício', COMMANDS: 'Comandas', CASH: 'Cofre', SCHEDULE: 'Escala', CANCELLATIONS: 'Cancelamentos',
  STOCK: 'Estoque', INVENTORY: 'Inventário', UTENSILS: 'Utensílios', CERTIFICATES: 'Atestados',
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

/**
 * v1.215.0 — como cada componente individual foi medido, em frases:
 * "Checklists: 92% nos seus 18 dias de plantão · sua participação 40% da sua parte".
 */
export function explicarIndividual(m: MetaDoUsuario): string[] {
  const varias = m.unidades.length > 1;
  return (m.individuais ?? []).map(({ unitName, key, name, r }) => {
    const onde = varias ? ` (${unitName})` : '';
    const rotulo = rotuloCurto(key, name);
    if (r.diasDePlantao == null) return `${rotulo}${onde}: ${r.done} de ${r.done + r.missed} confirmado(s) por você no prazo = ${r.scorePct}%`;
    const base = `${rotulo}${onde}: ${r.pctNosDias}% nos seus ${r.diasDePlantao} dia(s) de plantão`;
    if (r.participacaoPct == null) return `${base} · nada feito por gerente para dividir`;
    if (r.fatorPct >= 100) return `${base} · você fez ${r.participacaoPct}% da sua parte`;
    return `${base} · você fez ${r.participacaoPct}% da sua parte (mínimo 25%) → fica ${r.scorePct}%`;
  });
}
