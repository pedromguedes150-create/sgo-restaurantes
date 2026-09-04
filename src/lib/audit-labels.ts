/**
 * Rótulos em PT-BR para o Log de Auditoria (Onda 5).
 *
 * A tela mostrava o código cru do banco — "PAYMENT_APPROVE", "CASH_BUCKET_SET" —
 * e 22 chips com o nome do módulo em inglês. Como há ~190 ações distintas,
 * traduzir uma a uma seria uma lista que envelhece a cada recurso novo. Aqui a
 * tradução é COMPOSICIONAL: o código é lido como ENTIDADE + VERBO, então uma
 * ação nova nasce traduzida sem ninguém tocar neste arquivo.
 */

export const MODULE_LABEL: Record<string, string> = {
  AUTH: 'Acesso',
  CANCELLATIONS: 'Cancelamentos',
  CASH: 'Troco',
  CHECKLISTS: 'Checklists',
  COMMANDS: 'Comandas',
  COMMUNICATION: 'Comunicação',
  CONFIG: 'Configurações',
  DASHBOARD: 'Início',
  GAS: 'Gás',
  GENERAL: 'Geral',
  INVENTORY: 'Inventário',
  LGPD: 'LGPD',
  MAINTENANCE: 'Manutenção',
  META: 'Metas',
  NOTES: 'Notas',
  OCCURRENCES: 'Ocorrências',
  OIL: 'Óleo',
  PAYMENTS: 'Pagamentos',
  PEOPLE: 'Pessoas',
  POPS: 'POPs',
  SCHEDULE: 'Escala',
  SUPERVISION: 'Supervisão',
  SYSTEM: 'Sistema',
  TASKS: 'Tarefas',
  WASTE: 'Desperdícios',
};

export const moduleLabel = (m: string | null | undefined) => (m ? MODULE_LABEL[m] ?? m : '—');

/**
 * Ações que não seguem o padrão ENTIDADE_VERBO. Cada uma declara o próprio
 * grupo — deduzir daria errado justamente nas que mais importam numa auditoria
 * (consulta a dado sensível, por exemplo).
 */
const WHOLE: Record<string, [string, VerbGroup]> = {
  LOGIN: ['Entrada no sistema', 'OUTROS'],
  LOGOUT: ['Saída do sistema', 'OUTROS'],
  LOGIN_FAILED: ['Tentativa de entrada recusada', 'OUTROS'],
  PASSWORD_CHANGE: ['Troca de senha', 'EDICAO'],
  PROFILE_UPDATE: ['Perfil atualizado', 'EDICAO'],
  RH_SYNC_AUTO: ['Sincronização automática do RH', 'OUTROS'],
  ALLOCATE: ['Alocação no mapa de funções', 'CRIACAO'],
  ALLOCATE_UPDATE: ['Alocação alterada', 'EDICAO'],
  DEALLOCATE: ['Remoção do mapa de funções', 'EXCLUSAO'],
  CANCEL_ANALYSIS: ['Análise antifraude de cancelamentos', 'CONSULTA'],
  OPEN_CMD_ANALYSIS: ['Análise de comandas em aberto', 'CONSULTA'],
  // LGPD: ver anexo sensível é CONSULTA, e precisa ser filtrável como tal.
  OCC_VIEW_ATTACHMENTS: ['Ocorrência — consulta de anexos', 'CONSULTA'],
};

/** Prefixos de entidade, do mais específico para o mais genérico. */
const ENTITIES: [string, string][] = [
  ['CHECKLIST_FORM', 'Ficha'],
  ['CHECKLIST_MODEL', 'Modelo de checklist'],
  ['CHECKLIST_TOLERANCE', 'Tolerância do checklist'],
  ['SUPERVISOR_CHECKLIST', 'Checklist de visita'],
  ['COMMAND_DIVERGENCE', 'Divergência de comanda'],
  ['COMMAND_DIV', 'Divergência de comanda'],
  ['COMMAND_SEQ', 'Sequência de comandas'],
  ['COMMAND_COUNT', 'Contagem de comandas'],
  ['COMMAND_REPLACEMENT', 'Reposição de comanda'],
  ['CASH_BUCKET', 'Balde do cofre'],
  ['CASH_DENOM', 'Denominações do cofre'],
  ['CASH_CHANGE_REQUEST', 'Solicitação de troco'],
  ['CASH_SESSION', 'Sessão de caixa'],
  ['FREELANCER_SECTOR_RATE', 'Valor do freelancer por setor'],
  ['FREELANCER_RATE', 'Valor do freelancer'],
  ['PRODUCT_STANDARD', 'Padrão de produtos'],
  ['PRODUCT_REQUEST', 'Solicitação de produtos'],
  ['GAS_CONTRACT', 'Contrato de gás'],
  ['GAS_RECEIPT', 'Recebimento de gás'],
  ['GAS_IMPORT', 'Importação de notas de gás'],
  ['GAS_ALERT_PCT', 'Limite de alerta do gás'],
  ['FREELANCER_WEEK_LIMIT', 'Limite semanal do freelancer (recorrência)'],
  ['MAINT_TICKET', 'Chamado de manutenção'],
  ['MAINT_PLAN', 'Plano preventivo'],
  ['TASK_INSTANCE', 'Tarefa'],
  ['OCC_CATEGORY', 'Categoria de ocorrência'],
  ['OCC_TYPE', 'Tipo de ocorrência'],
  ['INV_ITEM', 'Item de inventário'],
  ['VISIT_PLAN', 'Recorrência de visitas'],
  ['SCHEDULE_PATTERN', 'Padrão de escala'],
  ['SCHEDULE_CHANGE', 'Troca de escala'],
  ['SCHEDULE_ABSENCE', 'Ausência na escala'],
  ['SCHEDULE_VARIATION', 'Variação na escala'],
  ['VACATION_CHANGE_REQUEST', 'Alteração de férias'],
  ['WASTE_CATEGORY', 'Categoria de desperdício'],
  ['WORKFORCE_SIMULATION', 'Simulação do mapa'],
  ['ROLE_CHANGE_FUNCTION', 'Mudança de função'],
  ['ENTRY_DATE_EDITED', 'Data do lançamento'],
  ['LATE_ENTRY_PENALTY', 'Penalidade por atraso'],
  ['MANAGER_SCHEDULE', 'Horário do gerente'],
  ['TERMINATION', 'Desligamento'],
  ['CERTIFICATE', 'Atestado'],
  ['COMMUNICATION', 'Comunicado'],
  ['CANCELLATION', 'Cancelamento'],
  ['DELEGATION', 'Delegação de aprovação'],
  ['EVALUATION', 'Avaliação'],
  ['OBSERVATION', 'Observação'],
  ['PERMISSION', 'Perfil de acesso'],
  ['FREELANCER', 'Freelancer'],
  ['INVENTORY', 'Inventário'],
  ['MISCTYPE', 'Tipo de avulso'],
  ['SUPPLIER', 'Fornecedor'],
  ['TEMPLATE', 'Checklist'],
  ['TRAINING', 'Treinamento'],
  ['PAYMENT', 'Pagamento'],
  ['PAYOUT', 'Comissão'],
  ['VACATION', 'Férias'],
  ['HOLIDAY', 'Feriado'],
  ['HYGIENE', 'Higiene'],
  ['PRODUCT', 'Produto'],
  ['SECTOR', 'Setor'],
  ['SHIFT', 'Turno'],
  ['UNIT', 'Unidade'],
  ['USER', 'Usuário'],
  ['VISIT', 'Visita'],
  ['WASTE', 'Desperdício'],
  ['NOTE', 'Nota'],
  ['OIL', 'Óleo'],
  ['OCC', 'Ocorrência'],
  ['POP', 'POP'],
  ['CASH', 'Cofre'],
];

/** Grupos de verbo — também alimentam o filtro "Tipo de ação". */
export const VERB_GROUPS = {
  CRIACAO: 'Criação',
  EDICAO: 'Edição',
  EXCLUSAO: 'Exclusão',
  DECISAO: 'Decisão',
  CONCLUSAO: 'Conclusão',
  CONSULTA: 'Consulta',
  OUTROS: 'Outros',
} as const;
export type VerbGroup = keyof typeof VERB_GROUPS;

const VERBS: [string, string, VerbGroup][] = [
  ['CREATE', 'criação', 'CRIACAO'],
  ['REQUEST', 'solicitação', 'CRIACAO'],
  ['OPEN', 'abertura', 'CRIACAO'],
  ['SCHEDULE', 'agendamento', 'CRIACAO'],
  ['IMPORT', 'importação', 'CRIACAO'],
  ['SEED', 'carga inicial', 'CRIACAO'],
  ['DUPLICATE', 'duplicação', 'CRIACAO'],
  ['ADD', 'inclusão', 'CRIACAO'],
  ['SAVED', 'gravação', 'EDICAO'],
  ['SAVE', 'gravação', 'EDICAO'],
  ['UPDATE', 'edição', 'EDICAO'],
  ['EDIT', 'edição', 'EDICAO'],
  ['EDITED', 'edição', 'EDICAO'],
  ['SET', 'definição', 'EDICAO'],
  ['REORDER', 'reordenação', 'EDICAO'],
  ['COPY', 'cópia', 'EDICAO'],
  ['ROTATE', 'rotação da chave', 'EDICAO'],
  ['FILL', 'preenchimento', 'EDICAO'],
  ['CHANGE', 'alteração', 'EDICAO'],
  ['TOGGLE', 'ativação/desativação', 'EDICAO'],
  ['RESET', 'reinício', 'EDICAO'],
  ['DELETE', 'exclusão', 'EXCLUSAO'],
  ['APPROVE', 'aprovação', 'DECISAO'],
  ['REJECT', 'recusa', 'DECISAO'],
  ['CANCEL', 'cancelamento', 'DECISAO'],
  ['PAID', 'baixa de pagamento', 'DECISAO'],
  ['JUSTIFY', 'justificativa', 'DECISAO'],
  ['RESOLVE', 'resolução', 'DECISAO'],
  ['INVESTIGATING', 'apuração', 'DECISAO'],
  ['IN_PROGRESS', 'andamento', 'DECISAO'],
  ['DONE', 'conclusão', 'CONCLUSAO'],
  ['CLOSE', 'encerramento', 'CONCLUSAO'],
  ['PUBLISH', 'publicação', 'CONCLUSAO'],
  ['REOPEN', 'reabertura', 'CONCLUSAO'],
  ['OFF', 'desligamento', 'CONCLUSAO'],
  ['VIEW', 'consulta', 'CONSULTA'],
  ['READ', 'leitura', 'CONSULTA'],
  ['ALERT', 'alerta', 'OUTROS'],
  ['REMIND', 'cobrança', 'OUTROS'],
  ['BATCH', 'em lote', 'OUTROS'],
  ['COUNT', 'contagem', 'OUTROS'],
];

export interface ActionInfo { label: string; group: VerbGroup }

/** "PAYMENT_APPROVE" → { label: "Pagamento — aprovação", group: "DECISAO" } */
export function describeAction(action: string): ActionInfo {
  const whole = WHOLE[action];
  if (whole) return { label: whole[0], group: whole[1] };

  const entity = ENTITIES.find(([p]) => action === p || action.startsWith(p + '_'));
  const rest = entity ? action.slice(entity[0].length).replace(/^_/, '') : action;
  const verb = VERBS.find(([v]) => rest === v || rest.endsWith('_' + v) || rest.startsWith(v));

  if (entity && verb) return { label: `${entity[1]} — ${verb[1]}`, group: verb[2] };
  if (entity) return { label: entity[1], group: 'OUTROS' };
  if (verb) return { label: verb[1].charAt(0).toUpperCase() + verb[1].slice(1), group: verb[2] };

  // Desconhecido: pelo menos deixa legível, em vez do código cru.
  return { label: action.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()), group: 'OUTROS' };
}
