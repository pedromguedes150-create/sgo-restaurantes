/**
 * Categorias de push. O usuário liga/desliga por CATEGORIA (não por módulo) —
 * 20 chaves na tela viraria ruído e ele acabaria desligando tudo.
 * Notificações críticas ignoram a preferência.
 */

export interface PushCategory {
  key: string;
  label: string;
  hint: string;
}

export const PUSH_CATEGORIES: PushCategory[] = [
  { key: 'TAREFAS', label: 'Tarefas e metas', hint: 'Checklists, lembretes das suas tarefas e meta do mês' },
  { key: 'COMUNICADOS', label: 'Comunicados', hint: 'Avisos da supervisão que exigem confirmação de leitura' },
  { key: 'OCORRENCIAS', label: 'Ocorrências e manutenção', hint: 'Ocorrências abertas/encerradas e chamados de manutenção' },
  { key: 'OPERACAO', label: 'Operação do dia', hint: 'Desperdício, comandas, notas, gás, óleo, cofre e estoque' },
  { key: 'PESSOAS', label: 'Pessoas e escala', hint: 'Escala, atestados, pagamentos, férias e mudanças de função' },
  { key: 'GERAL', label: 'Gerais', hint: 'Demais avisos do sistema' },
];

const MODULE_TO_CATEGORY: Record<string, string> = {
  TASKS: 'TAREFAS',
  CHECKLISTS: 'TAREFAS',
  META: 'TAREFAS',
  TRAINING: 'TAREFAS',
  POPS: 'TAREFAS',
  COMMUNICATION: 'COMUNICADOS',
  OCCURRENCES: 'OCORRENCIAS',
  MAINTENANCE: 'OCORRENCIAS',
  HYGIENE: 'OCORRENCIAS',
  WASTE: 'OPERACAO',
  COMMANDS: 'OPERACAO',
  CANCELLATIONS: 'OPERACAO',
  NOTES: 'OPERACAO',
  GAS: 'OPERACAO',
  OIL: 'OPERACAO',
  CASH: 'OPERACAO',
  INVENTORY: 'OPERACAO',
  PRODUCTS: 'OPERACAO',
  SUPERVISION: 'OPERACAO',
  PEOPLE: 'PESSOAS',
  SCHEDULE: 'PESSOAS',
  CERTIFICATES: 'PESSOAS',
  PAYMENTS: 'PESSOAS',
  TERMINATIONS: 'PESSOAS',
};

/** Categoria de push de um módulo de notificação (fallback: GERAL). */
export function categoryOfModule(module?: string | null): string {
  if (!module) return 'GERAL';
  return MODULE_TO_CATEGORY[module.toUpperCase()] ?? 'GERAL';
}

/** Rótulo curto do aparelho, para o usuário reconhecer a inscrição na lista. */
export function deviceLabelFromUserAgent(ua?: string | null): string {
  const s = (ua ?? '').toLowerCase();
  if (!s) return 'Aparelho';
  const so = s.includes('android')
    ? 'Android'
    : /iphone|ipad|ipod/.test(s)
      ? 'iPhone/iPad'
      : s.includes('windows')
        ? 'Windows'
        : s.includes('mac os')
          ? 'Mac'
          : s.includes('linux')
            ? 'Linux'
            : 'Aparelho';
  const nav = s.includes('edg/')
    ? 'Edge'
    : s.includes('opr/') || s.includes('opera')
      ? 'Opera'
      : s.includes('firefox')
        ? 'Firefox'
        : s.includes('chrome')
          ? 'Chrome'
          : s.includes('safari')
            ? 'Safari'
            : 'Navegador';
  return `${so} · ${nav}`;
}
