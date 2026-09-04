/**
 * As ABAS de cada módulo como partes da matriz de perfis.
 *
 * Tela interna com endereço próprio já vira parte sozinha (a guarda de rota
 * resolve pelo caminho). Aba não tem endereço: ela vive dentro de uma tela só,
 * então precisa estar declarada aqui para o Admin poder fechá-la.
 *
 * Este arquivo é a ÚNICA fonte: `permissions.ts` gera as linhas da matriz a
 * partir dele, as telas escondem a aba por ele, e as rotas recusam a gravação
 * por ele. Se cada lado tivesse a sua lista, a aba sumiria da tela e o servidor
 * continuaria aceitando — ou pior, o botão apareceria e o servidor recusaria.
 *
 * `id` é EXATAMENTE o valor que o componente usa para a aba: é o que permite a
 * tela filtrar sem tradução no meio.
 */

export interface AbaDef {
  id: string;
  key: string;
  label: string;
  /** Aba de consulta (painel, histórico): não faz sentido separar "Editar". */
  soVer?: boolean;
}

export const ABAS: Record<string, AbaDef[]> = {
  MANAGER_AREA: [
    // chaves da v1.64.0 — não renomear, já existem linhas gravadas no banco
    { id: 'tarefas', key: 'MANAGER_AREA_TASKS', label: 'Minhas tarefas' },
    { id: 'notas', key: 'MANAGER_AREA_NOTES', label: 'Bloco de notas' },
    { id: 'folgas', key: 'MANAGER_AREA_LEAVES', label: 'Folgas / férias (e meu horário)' },
  ],

  PAYMENTS: [
    { id: 'nova', key: 'PAYMENTS_TAB_NEW', label: 'Nova solicitação' },
    { id: 'minhas', key: 'PAYMENTS_TAB_MINE', label: 'Minhas solicitações' },
    { id: 'aprovar', key: 'PAYMENTS_TAB_APPROVE', label: 'Aprovar' },
    { id: 'pagar', key: 'PAYMENTS_TAB_PAY', label: 'Pagar' },
    { id: 'historico', key: 'PAYMENTS_TAB_HISTORY', label: 'Histórico', soVer: true },
  ],

  NOTES: [
    { id: 'lista', key: 'NOTES_TAB_LIST', label: 'Notas lançadas' },
    { id: 'venc', key: 'NOTES_TAB_DUE', label: 'Vencimentos', soVer: true },
  ],

  CASH: [
    { id: 'cofre', key: 'CASH_TAB_VAULT', label: 'Cofre (contagem e movimentos)' },
    { id: 'historico', key: 'CASH_TAB_HISTORY', label: 'Histórico', soVer: true },
  ],

  INVENTORY: [
    { id: 'estoque', key: 'INVENTORY_TAB_STOCK', label: 'Estoque', soVer: true },
    { id: 'movimentar', key: 'INVENTORY_TAB_MOVE', label: 'Movimentar (entrada/saída)' },
    { id: 'contagem', key: 'INVENTORY_TAB_COUNT', label: 'Contagem' },
    { id: 'historico', key: 'INVENTORY_TAB_HISTORY', label: 'Histórico', soVer: true },
  ],

  MAINTENANCE: [
    { id: 'chamados', key: 'MAINTENANCE_TAB_TICKETS', label: 'Chamados' },
    { id: 'preventiva', key: 'MAINTENANCE_TAB_PLANS', label: 'Preventiva' },
  ],

  SUPERVISION: [
    { id: 'PAINEL', key: 'SUPERVISION_TAB_PANEL', label: 'Painel de uso', soVer: true },
    { id: 'VISITAS', key: 'SUPERVISION_TAB_VISITS', label: 'Visitas' },
  ],

  PRODUCTS: [
    { id: 'novo', key: 'PRODUCTS_TAB_NEW', label: 'Nova solicitação' },
    { id: 'meus', key: 'PRODUCTS_TAB_MINE', label: 'Meus pedidos', soVer: true },
    { id: 'ops', key: 'PRODUCTS_TAB_OPS', label: 'Atendimento dos pedidos' },
  ],

  CERTIFICATES: [
    { id: 'lancar', key: 'CERTIFICATES_TAB_NEW', label: 'Lançar atestado' },
    { id: 'historico', key: 'CERTIFICATES_TAB_HISTORY', label: 'Histórico', soVer: true },
    { id: 'painel', key: 'CERTIFICATES_TAB_PANEL', label: 'Painel de absenteísmo', soVer: true },
  ],

  COMMUNICATION: [
    { id: 'recebidos', key: 'COMMUNICATION_TAB_INBOX', label: 'Recebidos' },
    { id: 'novo', key: 'COMMUNICATION_TAB_NEW', label: 'Novo comunicado' },
    { id: 'painel', key: 'COMMUNICATION_TAB_PANEL', label: 'Painel de leitura', soVer: true },
  ],

  TERMINATIONS: [
    { id: 'solicitar', key: 'TERMINATIONS_TAB_NEW', label: 'Solicitar desligamento' },
    { id: 'lista', key: 'TERMINATIONS_TAB_LIST', label: 'Solicitações' },
  ],

  GAS: [
    { id: 'lancar', key: 'GAS_TAB_NEW', label: 'Lançar recebimento' },
    { id: 'painel', key: 'GAS_TAB_PANEL', label: 'Painel de preço', soVer: true },
    { id: 'historico', key: 'GAS_TAB_HISTORY', label: 'Histórico', soVer: true },
    { id: 'contratos', key: 'GAS_TAB_CONTRACTS', label: 'Contratos' },
  ],

  OIL: [
    { id: 'lancar', key: 'OIL_TAB_NEW', label: 'Lançar coleta' },
    { id: 'painel', key: 'OIL_TAB_PANEL', label: 'Painel', soVer: true },
    { id: 'historico', key: 'OIL_TAB_HISTORY', label: 'Histórico', soVer: true },
  ],

  PEOPLE: [
    { id: 'col', key: 'PEOPLE_TAB_STAFF', label: 'Colaboradores' },
    { id: 'fer', key: 'PEOPLE_TAB_VACATION', label: 'Férias' },
    { id: 'esc', key: 'PEOPLE_TAB_SCHEDULE', label: 'Variações de escala', soVer: true },
  ],

  SCHEDULE: [
    { id: 'planejado', key: 'SCHEDULE_TAB_PLANNED', label: 'Planejado' },
    { id: 'realizado', key: 'SCHEDULE_TAB_ACTUAL', label: 'Realizado' },
    { id: 'comparacao', key: 'SCHEDULE_TAB_COMPARE', label: 'Comparação', soVer: true },
  ],

  OCCURRENCES: [
    { id: 'geral', key: 'OCCURRENCES_TAB_GENERAL', label: 'Assunto: Geral' },
    { id: 'manutencao', key: 'OCCURRENCES_TAB_MAINT', label: 'Assunto: Manutenção' },
    { id: 'ti', key: 'OCCURRENCES_TAB_IT', label: 'Assunto: TI' },
  ],
};

/** Permissão de uma aba, no formato que a tela recebe. */
export interface PermAba { canView: boolean; canEdit: boolean }
export type AcessoAbas = Record<string, PermAba>;

const LIBERADA: PermAba = { canView: true, canEdit: true };

/** Traduz a matriz de permissões para as abas de um módulo. */
export function acessoDasAbas(perms: Record<string, PermAba | undefined>, modulo: string): AcessoAbas {
  const out: AcessoAbas = {};
  for (const a of ABAS[modulo] ?? []) out[a.id] = perms[a.key] ?? LIBERADA;
  return out;
}

/** A chave da matriz que manda numa aba (para a rota recusar a gravação). */
export function chaveDaAba(modulo: string, abaId: string): string | null {
  return (ABAS[modulo] ?? []).find((a) => a.id === abaId)?.key ?? null;
}

/** As abas visíveis, na ordem em que o módulo as declara. */
export function abasVisiveis(acesso: AcessoAbas, modulo: string): AbaDef[] {
  return (ABAS[modulo] ?? []).filter((a) => acesso[a.id]?.canView !== false);
}

/** A aba em que a tela deve abrir: a preferida, se estiver liberada; senão a primeira que houver. */
export function abaInicial(acesso: AcessoAbas, modulo: string, preferida: string): string {
  if (acesso[preferida]?.canView !== false) return preferida;
  return abasVisiveis(acesso, modulo)[0]?.id ?? preferida;
}

/** A aba está liberada? (o padrão, sem informação nenhuma, é liberada) */
export function podeAba(acesso: AcessoAbas, id: string): boolean {
  return acesso[id]?.canView !== false;
}

/** A aba aceita gravação? */
export function podeEditarAba(acesso: AcessoAbas, id: string): boolean {
  return acesso[id]?.canEdit !== false;
}
