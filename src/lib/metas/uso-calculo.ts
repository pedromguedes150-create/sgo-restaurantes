import { faixaDaMeta, type Faixa } from '@/lib/metas/graficos';
import type { MetaDaUnidade, MetaDoUsuario, PesoDaMeta } from '@/lib/metas/meta-por-usuario';

/**
 * USO DO SGO — regras PURAS (v1.164.0). Relatório executivo de quem usa o
 * sistema, por unidade e por usuário, para a bonificação dos gerentes.
 * Tudo é composição de contagens já existentes (painel de uso do supervisor,
 * tarefas por quem concluiu e Auditoria). Nada aqui grava nem recalcula meta.
 */

export interface UnidadeUso {
  unitId: string; unitName: string;
  /** Média dos indicadores diários (checklist, desperdício, comandas) — a mesma do painel do supervisor. */
  usagePct: number; checklistPct: number; wastePct: number; commandsPct: number; metaPct: number;
  /** Tarefas do mês: concluídas no prazo, fora do prazo e não realizadas. */
  done: number; late: number; missed: number;
  /** Ações registradas na Auditoria no mês (sem login/logout) e quantos usuários distintos as fizeram. */
  acoes: number; usuariosAtivos: number; usuariosVinculados: number;
  occurrences: number; notes: number;
  /**
   * v1.182.0 — PR B: o que ainda está aberto no mês, separado pelo prazo (instante `dueAt`, comparado com agora):
   * pendentes = ainda no prazo; vencidas = prazo passou e ninguém resolveu (nem viraram "não realizadas").
   */
  pendentes: number; vencidas: number;
  /** Gerentes e coordenadores vinculados — quem responde pela unidade. */
  responsaveis: string[];
  /** O componente ATIVO com o pior % no mês (onde a unidade mais perde), ou nulo. */
  piorComponente: { key: string; name: string; weight: number; scorePct: number } | null;
  /** Os descontos nomeados da meta da unidade (quem está sem folga, quantas datas corrigidas). */
  descontos: { name: string; quantidade: number; pct: number; total: number; detalhe?: string }[];
  /**
   * v1.186.0 — UM item por componente ATIVO com peso (as colunas da Configuração da Meta), na ordem de
   * `colunasDaMeta`: o % da unidade naquele componente (a mesma conta de Metas) ou nulo = nada a medir no mês.
   */
  componentes: ComponenteDaUnidade[];
}
export interface ComponenteDaUnidade { key: string; name: string; weight: number; scorePct: number | null }

/** As colunas da meta (peso > 0), do maior peso para o menor — a MESMA ordem do quadro "Meta por usuário". */
export function colunasDaMeta(pesos: PesoDaMeta[]): PesoDaMeta[] {
  return [...pesos].filter((p) => p.weight > 0).sort((a, b) => b.weight - a.weight);
}
/**
 * O % da unidade em CADA componente ativo (v1.186.0, pedido do Pedro: "todos que estão ativos e contam na
 * comissão devem aparecer no quadro das unidades"). Componente em vigor que a unidade não pontuou (nada
 * resolvido no mês) sai nulo — é "—" na tela, nunca zero.
 */
export function componentesDaUnidade(meta: Pick<MetaDaUnidade, 'componentes'> | null | undefined, pesos: PesoDaMeta[]): ComponenteDaUnidade[] {
  return colunasDaMeta(pesos).map((p) => ({ key: p.key, name: p.name, weight: p.weight, scorePct: meta?.componentes.find((c) => c.key === p.key)?.scorePct ?? null }));
}
export interface UsuarioUso {
  userId: string; name: string; role: string; roleLabel: string; unidades: string[];
  acessos: number; acoes: number; modulos: string[];
  tarefasConcluidas: number; foraDoPrazo: number;
  ultimoAcesso: string | null;
  /** v1.179.0 — a nota da bonificação: a meta da(s) unidade(s) que a pessoa cuida (nulo = sem unidade). */
  meta: MetaDoUsuario | null;
  /** Gerente/coordenador lançou a própria folga no mês? Nulo para quem não é medido nisso (supervisor). */
  folgaPropria: boolean | null;
  /** v1.182.0 — PR B: cumprimento, não acesso. Pontualidade = no prazo ÷ (no prazo + fora) do que ESTE usuário concluiu; nula sem conclusão. */
  pontualidade: number | null;
  /** Pendências das unidades que o usuário cuida: ainda no prazo, vencidas e não realizadas (não é por pessoa: o SGO não sabe o plantão). */
  pendentes: number; vencidas: number; naoRealizadas: number;
}

/** Pontualidade de quem concluiu: no prazo ÷ (no prazo + fora). Sem conclusão = nula (não é zero). */
export function pontualidade(noPrazo: number, foraDoPrazo: number): number | null {
  const total = noPrazo + foraDoPrazo;
  return total ? Math.round((noPrazo / total) * 100) : null;
}
/** O componente que pesa com o pior % da unidade (desempate: maior peso) — "onde entrar primeiro". */
export function piorComponente(meta: Pick<MetaDaUnidade, 'componentes'> | null | undefined): UnidadeUso['piorComponente'] {
  if (!meta || meta.componentes.length === 0) return null;
  const pior = [...meta.componentes].sort((a, b) => a.scorePct - b.scorePct || b.weight - a.weight)[0];
  return { key: pior.key, name: pior.name, weight: pior.weight, scorePct: pior.scorePct };
}

export const faixaDeUso = faixaDaMeta;

/** Taxa de falha nas tarefas: não realizadas + fora do prazo ÷ resolvidas. */
export function taxaDeFalha(u: { done: number; late: number; missed: number }): number | null {
  const resolvidas = u.done + u.late + u.missed;
  return resolvidas ? Math.round(((u.late + u.missed) / resolvidas) * 100) : null;
}

export interface ResumoDoUso {
  unidades: number;
  mediaUso: number | null;
  porFaixa: { faixa: Faixa; qtd: number; unidades: string[] }[];
  totalAcoes: number;
  totalAcessos: number;
  tarefas: { done: number; late: number; missed: number; resolvidas: number; pctNoPrazo: number | null };
  usuariosAtivos: number;
  usuariosSemUso: UsuarioUso[];
  maisUsam: UsuarioUso[];
  menosUsam: UsuarioUso[];
  unidadeMaisUsa: UnidadeUso | null;
  unidadeMenosUsa: UnidadeUso | null;
  unidadeMaisDeixaDeFazer: (UnidadeUso & { taxa: number }) | null;
  unidadeMaisErra: (UnidadeUso & { taxa: number }) | null;
  /** v1.179.0 — as notas da bonificação: média, melhor e menor entre quem tem nota. */
  notas: { media: number | null; melhor: UsuarioUso | null; menor: UsuarioUso | null };
  /** v1.182.0 — o que está aberto na rede agora: no prazo e vencido; e a unidade com mais vencidas. */
  pendencias: { pendentes: number; vencidas: number; unidadeMaisVencidas: UnidadeUso | null };
}

export function resumirUso(unidades: UnidadeUso[], usuarios: UsuarioUso[]): ResumoDoUso {
  const porUso = [...unidades].sort((a, b) => b.usagePct - a.usagePct || b.acoes - a.acoes);
  const porAcoes = [...usuarios].sort((a, b) => b.acoes - a.acoes || b.tarefasConcluidas - a.tarefasConcluidas || a.name.localeCompare(b.name, 'pt-BR'));
  const done = unidades.reduce((s, u) => s + u.done, 0);
  const late = unidades.reduce((s, u) => s + u.late, 0);
  const missed = unidades.reduce((s, u) => s + u.missed, 0);
  const resolvidas = done + late + missed;
  const comTarefas = unidades.filter((u) => u.done + u.late + u.missed > 0);
  const maisDeixa = [...comTarefas].sort((a, b) => (b.missed / (b.done + b.late + b.missed)) - (a.missed / (a.done + a.late + a.missed)) || b.missed - a.missed)[0];
  const maisErra = [...comTarefas].sort((a, b) => (taxaDeFalha(b) ?? 0) - (taxaDeFalha(a) ?? 0) || (b.late + b.missed) - (a.late + a.missed))[0];
  const comNota = usuarios.filter((u) => u.meta != null).sort((a, b) => b.meta!.scorePct - a.meta!.scorePct || a.name.localeCompare(b.name, 'pt-BR'));
  const notas = {
    media: comNota.length ? Math.round(comNota.reduce((s, u) => s + u.meta!.scorePct, 0) / comNota.length) : null,
    melhor: comNota[0] ?? null,
    menor: comNota.length ? comNota[comNota.length - 1] : null,
  };
  return {
    unidades: unidades.length,
    mediaUso: unidades.length ? Math.round(unidades.reduce((s, u) => s + u.usagePct, 0) / unidades.length) : null,
    porFaixa: (['VERDE', 'AMBAR', 'VERMELHO'] as Faixa[]).map((faixa) => {
      const xs = porUso.filter((u) => faixaDeUso(u.usagePct) === faixa);
      return { faixa, qtd: xs.length, unidades: xs.map((u) => u.unitName) };
    }),
    totalAcoes: usuarios.reduce((s, u) => s + u.acoes, 0),
    totalAcessos: usuarios.reduce((s, u) => s + u.acessos, 0),
    tarefas: { done, late, missed, resolvidas, pctNoPrazo: resolvidas ? Math.round((done / resolvidas) * 100) : null },
    usuariosAtivos: usuarios.filter((u) => u.acoes > 0).length,
    usuariosSemUso: porAcoes.filter((u) => u.acoes === 0),
    maisUsam: porAcoes.filter((u) => u.acoes > 0).slice(0, 5),
    menosUsam: porAcoes.filter((u) => u.acoes > 0).slice(-5).reverse(),
    unidadeMaisUsa: porUso[0] ?? null,
    unidadeMenosUsa: porUso.length > 1 ? porUso[porUso.length - 1] : null,
    unidadeMaisDeixaDeFazer: maisDeixa && maisDeixa.missed > 0 ? { ...maisDeixa, taxa: Math.round((maisDeixa.missed / (maisDeixa.done + maisDeixa.late + maisDeixa.missed)) * 100) } : null,
    unidadeMaisErra: maisErra && (maisErra.late + maisErra.missed) > 0 ? { ...maisErra, taxa: taxaDeFalha(maisErra) ?? 0 } : null,
    notas,
    pendencias: {
      pendentes: unidades.reduce((s, u) => s + u.pendentes, 0),
      vencidas: unidades.reduce((s, u) => s + u.vencidas, 0),
      unidadeMaisVencidas: [...unidades].sort((a, b) => b.vencidas - a.vencidas)[0]?.vencidas ? [...unidades].sort((a, b) => b.vencidas - a.vencidas)[0] : null,
    },
  };
}

export const ROTULO_FAIXA_USO: Record<Faixa, string> = { VERDE: 'Usa bem (≥ 80%)', AMBAR: 'Usa pouco (50–79%)', VERMELHO: 'Quase não usa (< 50%)' };
export const ROTULO_MODULO: Record<string, string> = {
  TASKS: 'Tarefas', WASTE: 'Desperdícios', COMMANDS: 'Comandas', CANCELLATIONS: 'Cancelamentos', NOTES: 'Notas', OCCURRENCES: 'Ocorrências', PAYMENTS: 'Pagamentos',
  PEOPLE: 'Pessoas', SCHEDULE: 'Escala', CASH: 'Troco', GAS: 'Gás', OIL: 'Óleo', INVENTORY: 'Inventário', STOCK: 'Estoque', PRODUCTS: 'Pedidos', COMMUNICATION: 'Comunicação',
  POPS: 'POPs', SUPERVISION: 'Supervisão', CONFIG: 'Configurações', PIZZAS: 'Pizzas', EXPENSES: 'Despesas', TICKET_MEDIA: 'Ticket médio', PREP_STANDARDS: 'Padronização', GENERAL: 'Geral',
};
export const rotuloDoModulo = (m: string) => ROTULO_MODULO[m] ?? m;
