import { faixaDaMeta, type Faixa } from '@/lib/metas/graficos';

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
}
export interface UsuarioUso {
  userId: string; name: string; role: string; roleLabel: string; unidades: string[];
  acessos: number; acoes: number; modulos: string[];
  tarefasConcluidas: number; foraDoPrazo: number;
  ultimoAcesso: string | null;
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
  };
}

export const ROTULO_FAIXA_USO: Record<Faixa, string> = { VERDE: 'Usa bem (≥ 80%)', AMBAR: 'Usa pouco (50–79%)', VERMELHO: 'Quase não usa (< 50%)' };
export const ROTULO_MODULO: Record<string, string> = {
  TASKS: 'Tarefas', WASTE: 'Desperdícios', COMMANDS: 'Comandas', CANCELLATIONS: 'Cancelamentos', NOTES: 'Notas', OCCURRENCES: 'Ocorrências', PAYMENTS: 'Pagamentos',
  PEOPLE: 'Pessoas', SCHEDULE: 'Escala', CASH: 'Troco', GAS: 'Gás', OIL: 'Óleo', INVENTORY: 'Inventário', STOCK: 'Estoque', PRODUCTS: 'Pedidos', COMMUNICATION: 'Comunicação',
  POPS: 'POPs', SUPERVISION: 'Supervisão', CONFIG: 'Configurações', PIZZAS: 'Pizzas', EXPENSES: 'Despesas', TICKET_MEDIA: 'Ticket médio', PREP_STANDARDS: 'Padronização', GENERAL: 'Geral',
};
export const rotuloDoModulo = (m: string) => ROTULO_MODULO[m] ?? m;
