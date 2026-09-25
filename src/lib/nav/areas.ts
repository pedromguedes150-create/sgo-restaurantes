/**
 * AS SETE ÁREAS DO MENU — a arquitetura de informação da navegação.
 *
 * Este arquivo diz APENAS onde cada módulo mora no menu. Os rótulos e os
 * endereços não estão aqui: vêm de `MODULES` (`src/lib/permissions.ts`), que já
 * é a lista autoritativa do sistema. Duplicar rótulo aqui criaria a quinta
 * lista de módulos escrita à mão — hoje já existiam quatro (a sidebar, as
 * famílias, o hub do celular e a matriz), e elas divergiam: módulo novo
 * entrava na matriz e sumia do menu, sem erro nenhum.
 *
 * Por isso aqui só há CHAVES. Chave que não existe na matriz quebra o teste
 * `nav-catalogo`; módulo com endereço que ninguém categorizou também. As duas
 * direções, porque as duas já aconteceram.
 *
 * Módulo é ARQUIVO, não é MENU: `parent` na matriz serve para o Admin fechar
 * uma parte de dentro de uma tela. Aqui a pergunta é outra — "onde a pessoa
 * procura isto?" —, e é por isso que Relatórios reúne coisas de cinco módulos
 * diferentes.
 */

export interface ColunaDaArea {
  titulo: string;
  /** Chaves de `MODULES`, na ordem em que aparecem na coluna. */
  keys: string[];
}

export interface AreaDoMenu {
  id: string;
  titulo: string;
  /** Ícone resolvido na tela (este módulo é puro, sem JSX). */
  icone: string;
  /** Endereço de abertura da área quando ela tem UM destino só. */
  colunas: ColunaDaArea[];
}

export const AREAS: AreaDoMenu[] = [
  {
    id: 'inicio',
    titulo: 'Início',
    icone: 'home',
    colunas: [
      { titulo: 'Meu painel', keys: ['DASHBOARD', 'MANAGER_AREA'] },
      { titulo: 'Comunicação', keys: ['COMMUNICATION', 'HELP'] },
    ],
  },
  {
    id: 'tarefas',
    titulo: 'Tarefas',
    icone: 'checks',
    colunas: [
      { titulo: 'Do dia', keys: ['TASKS', 'TASKS_CORRECTIONS', 'TASKS_HISTORY'] },
      { titulo: 'Checklists', keys: ['CHECKLIST_FORMS', 'HYGIENE'] },
      { titulo: 'Treinamento', keys: ['TRAINING', 'TRAINING_PANEL', 'POPS'] },
    ],
  },
  {
    id: 'operacao',
    titulo: 'Operação',
    icone: 'grid',
    colunas: [
      { titulo: 'Rotinas da unidade', keys: ['OIL', 'PIZZAS', 'GAS'] },
      { titulo: 'Controles', keys: ['WASTE', 'OCCURRENCES', 'MAINTENANCE', 'COMMANDS', 'CASH', 'CANCELLATIONS'] },
      { titulo: 'Suprimentos', keys: ['STOCK', 'NOTES', 'INVENTORY', 'PRODUCTS', 'PRODUCT_SEPARATION'] },
      { titulo: 'Conferências', keys: ['COMMANDS_SCAN', 'COMMANDS_SESSIONS', 'COMMANDS_OPEN', 'CANCELLATIONS_ITEMS', 'CASH_OFFICE'] },
    ],
  },
  {
    id: 'pessoas',
    titulo: 'Pessoas',
    icone: 'users',
    colunas: [
      { titulo: 'Equipe', keys: ['PEOPLE', 'PEOPLE_MAP', 'PEOPLE_EVALUATION', 'PEOPLE_PROBATION', 'PEOPLE_ROLE_CHANGES'] },
      { titulo: 'Escala e folgas', keys: ['SCHEDULE', 'MANAGER_SCHEDULE', 'SCHEDULE_OFF', 'SCHEDULE_SWAPS', 'LEAVES_TEAM'] },
      { titulo: 'Pagamentos', keys: ['PAYMENTS', 'PEOPLE_PAYOUTS'] },
      { titulo: 'Afastamentos', keys: ['CERTIFICATES', 'TERMINATIONS'] },
    ],
  },
  {
    id: 'performance',
    titulo: 'Performance',
    icone: 'chart',
    colunas: [
      { titulo: 'Metas', keys: ['METAS', 'METAS_CONFIG', 'METAS_CONSOLIDADO'] },
      { titulo: 'Acompanhamento', keys: ['SUPERVISION', 'EXECUTIVE', 'UNIT_PANEL', 'WASTE_CONSOLIDATED'] },
      { titulo: 'Ticket Médio', keys: ['TICKET_MEDIA', 'TICKET_MEDIA_IMPORT'] },
    ],
  },
  {
    id: 'relatorios',
    titulo: 'Relatórios',
    icone: 'file',
    colunas: [
      /* Relatório é o que se leva para fora do sistema — imprime, exporta,
         manda para o Financeiro ou para o RH. Eles vivem dentro de cinco
         módulos diferentes, e é por isso que ninguém os achava: quem procura
         "o relatório de freelancers" não pensa "isso fica em Pagamentos". */
      { titulo: 'Operação', keys: ['CANCELLATIONS_ANALYSIS', 'CANCELLATIONS_REPORT', 'NOTES_GAS', 'GAS_REPORT'] },
      { titulo: 'Pessoas', keys: ['PAYMENTS_FREELANCER_REPORT', 'CERTIFICATES_REPORT', 'SCHEDULE_RH_NOTICES'] },
      { titulo: 'Sistema', keys: ['AUDIT', 'AUDIT_REPORT'] },
    ],
  },
  {
    id: 'administrativo',
    titulo: 'Administrativo',
    icone: 'settings',
    colunas: [
      { titulo: 'Estrutura', keys: ['CONFIG', 'CONFIG_UNITS', 'CONFIG_USERS', 'CONFIG_PROFILES', 'CONFIG_INTEGRATIONS', 'CONFIG_RH_DIAG'] },
      { titulo: 'Operação', keys: ['CONFIG_CHECKLISTS', 'CONFIG_MODELS', 'CONFIG_SUP_CHECKLISTS', 'CONFIG_COMMANDS', 'CASH_CONFIG', 'CONFIG_WASTE', 'CONFIG_OCCURRENCES'] },
      { titulo: 'Cadastros', keys: ['CONFIG_SUPPLIERS', 'CONFIG_PRODUCTS', 'CONFIG_CD_SECTORS', 'CONFIG_PRODUCT_STANDARDS', 'CONFIG_PIZZAS', 'CONFIG_TICKET_MEDIA'] },
      { titulo: 'Pessoas e escala', keys: ['CONFIG_SCHEDULES', 'CONFIG_PAYMENTS', 'CONFIG_FREELANCER_RATES'] },
    ],
  },
];

/**
 * Módulos com endereço que DE PROPÓSITO não entram no menu por área.
 *
 * Cada um com o motivo escrito: sem isso, o teste que exige categorização
 * viraria um convite a jogar qualquer coisa numa coluna qualquer.
 */
export const FORA_DO_MENU: Record<string, string> = {
  /* Tela de uma ocorrência específica — chega-se a ela pela lista, nunca pelo
     menu. */
  OCCURRENCES_NEW: 'ação dentro de Ocorrências (botão da própria tela)',
};

/** Toda chave que o menu conhece — usada pelo teste e pela busca. */
export const KEYS_NO_MENU = new Set(AREAS.flatMap((a) => a.colunas.flatMap((c) => c.keys)));

/* ── O menu já resolvido (o que a tela recebe) ── */

export interface ItemDoMenu { key: string; label: string; href: string }
export interface ColunaMontada { titulo: string; itens: ItemDoMenu[] }
export interface AreaMontada { id: string; titulo: string; icone: string; colunas: ColunaMontada[]; href: string }
