/**
 * CONFIGURAÇÃO DA META COM VIGÊNCIA E STATUS (v1.180.0) — as regras, sem banco.
 *
 * Decisões do Pedro (03/11/2026):
 * 1. STATUS e PESO são independentes. O peso diz QUANTO o componente vale; o
 *    status diz SE ele entra na bonificação. Só `ATIVO` conta na nota.
 *    Homologação e Monitoramento são MEDIDOS e mostrados ("em observação"),
 *    mas não mudam a nota de ninguém; Desenvolvimento nem aparece. Ligar o
 *    peso de um módulo nunca o ativa sozinho.
 * 2. Toda alteração tem HISTÓRICO e VIGÊNCIA (um mês 'AAAA-MM', nunca
 *    anterior ao mês corrente): a nota de um período encerrado é calculada
 *    com os valores que valiam naquele mês, e uma mudança feita hoje não a
 *    reescreve.
 *
 * `valorVigente` é a única regra de resolução: a entrada com a maior
 * `validFrom` ≤ mês pedido; empate (duas gravações para o mesmo mês) = a mais
 * recente. A linha-base `'0000-01'` (o valor que valia antes de existir
 * histórico) vale para qualquer mês.
 */

export type StatusDoComponente = 'DESENVOLVIMENTO' | 'HOMOLOGACAO' | 'MONITORAMENTO' | 'ATIVO';

export const STATUS_DO_COMPONENTE: { value: StatusDoComponente; label: string; descricao: string }[] = [
  { value: 'DESENVOLVIMENTO', label: 'Em desenvolvimento', descricao: 'O módulo ainda está sendo construído: não é medido nem aparece na meta.' },
  { value: 'HOMOLOGACAO', label: 'Em homologação', descricao: 'Medido e mostrado "em observação", com a nota que a unidade teria se contasse — não entra na bonificação.' },
  { value: 'MONITORAMENTO', label: 'Monitoramento', descricao: 'Medido e mostrado "em observação" — não entra na bonificação.' },
  { value: 'ATIVO', label: 'Ativo', descricao: 'Conta na nota da bonificação com o peso configurado.' },
];
export const ROTULO_STATUS: Record<StatusDoComponente, string> = Object.fromEntries(STATUS_DO_COMPONENTE.map((s) => [s.value, s.label])) as Record<StatusDoComponente, string>;

export function normalizarStatus(v: unknown): StatusDoComponente | null {
  const s = String(v ?? '').trim().toUpperCase();
  return STATUS_DO_COMPONENTE.some((x) => x.value === s) ? (s as StatusDoComponente) : null;
}
/** Só o componente ATIVO entra na nota. Sem status (listas antigas, testes) = ativo. */
export const contaNaNota = (status?: StatusDoComponente | null) => !status || status === 'ATIVO';
/** Medido e mostrado sem contar: homologação e monitoramento. */
export const emObservacao = (status?: StatusDoComponente | null) => status === 'HOMOLOGACAO' || status === 'MONITORAMENTO';

/**
 * O status que cada componente HERDA na subida da versão: peso > 0 = estava
 * contando → Ativo; peso 0 = estava fora → Monitoramento. A migração grava
 * essa linha-base para os 12 componentes, e daí em diante só a mão do Admin
 * muda o status (o peso deixou de implicar ativação).
 */
export const statusHerdadoDoPeso = (weight: number): StatusDoComponente => (weight > 0 ? 'ATIVO' : 'MONITORAMENTO');

/** Os 12 componentes com peso (a mesma lista de `componentesDaMeta`) e o peso quando nunca foi gravado. */
export const COMPONENTES_DA_META: { key: string; name: string; pesoPadrao: number }[] = [
  { key: 'TASKS', name: 'Checklists do dia', pesoPadrao: 100 },
  { key: 'TRAINING', name: 'Treinamentos (POPs)', pesoPadrao: 15 },
  { key: 'COMMUNICATION', name: 'Comunicados', pesoPadrao: 10 },
  { key: 'PEOPLE_EVALUATION', name: 'Avaliações da equipe', pesoPadrao: 0 },
  { key: 'WASTE', name: 'Desperdício diário (cobertura)', pesoPadrao: 0 },
  { key: 'COMMANDS', name: 'Comandas diárias (cobertura)', pesoPadrao: 0 },
  { key: 'CASH', name: 'Gestão de Troco (contagem do cofre)', pesoPadrao: 0 },
  { key: 'SCHEDULE', name: 'Escala (Realizado preenchido)', pesoPadrao: 0 },
  { key: 'CANCELLATIONS', name: 'Cancelamentos justificados', pesoPadrao: 0 },
  { key: 'STOCK', name: 'Estoque (tratativas de validade)', pesoPadrao: 0 },
  { key: 'INVENTORY', name: 'Inventário Teknisa (agendamentos confirmados)', pesoPadrao: 0 },
  { key: 'UTENSILS', name: 'Inventário de utensílios (enviado no mês)', pesoPadrao: 0 },
  /* v1.181.0 — auditoria de atestados: nasce em 0 e em Monitoramento (linha-base na migração). */
  { key: 'CERTIFICATES', name: 'Atestados (lançamento no prazo)', pesoPadrao: 0 },
];
/* As chaves de peso seguem as de sempre (`<KEY>_META_WEIGHT`, exceto a da
   avaliação, que nasceu como EVALUATION_META_WEIGHT). */
const CHAVE_DO_PESO: Record<string, string> = { PEOPLE_EVALUATION: 'EVALUATION_META_WEIGHT' };
export const chaveDoPeso = (key: string) => CHAVE_DO_PESO[key] ?? `${key}_META_WEIGHT`;
export const chaveDoStatus = (key: string) => `${key}_META_STATUS`;
export const CHAVE_FORA_DO_PRAZO = 'LATE_ENTRY_PENALTY_PCT';
export const CHAVE_ESCALA_GERENTES = 'MANAGER_LEAVE_META_PENALTY';
export const DESCONTO_FORA_DO_PRAZO_PADRAO = 2;
export const DESCONTO_ESCALA_GERENTES_PADRAO = 5;

/* v1.181.0 — parâmetros da auditoria de atestados (prazo em horas úteis e as três faixas de penalização sobre o peso). */
export const CHAVE_PRAZO_ATESTADOS = 'CERT_AUDIT_DEADLINE_HOURS';
export const CHAVE_PEN_ATESTADOS_90 = 'CERT_AUDIT_PENALTY_90';
export const CHAVE_PEN_ATESTADOS_80 = 'CERT_AUDIT_PENALTY_80';
export const CHAVE_PEN_ATESTADOS_ABAIXO_80 = 'CERT_AUDIT_PENALTY_UNDER80';
export const PARAMETROS_DA_AUDITORIA: { key: string; rotulo: string; padrao: number; teto?: number }[] = [
  { key: CHAVE_PRAZO_ATESTADOS, rotulo: 'Prazo de lançamento (horas úteis após a ciência do gerente)', padrao: 24 },
  { key: CHAVE_PEN_ATESTADOS_90, rotulo: 'Conformidade 90–99,9%: perde (% do peso)', padrao: 10, teto: 100 },
  { key: CHAVE_PEN_ATESTADOS_80, rotulo: 'Conformidade 80–89,9%: perde (% do peso)', padrao: 25, teto: 100 },
  { key: CHAVE_PEN_ATESTADOS_ABAIXO_80, rotulo: 'Conformidade abaixo de 80%: perde (% do peso)', padrao: 50, teto: 100 },
];

export type TipoDeChave = 'PESO' | 'STATUS' | 'DESCONTO' | 'PARAMETRO';
export interface ChaveDaMeta { key: string; tipo: TipoDeChave; rotulo: string; componente?: string }
/** Toda chave que o histórico conhece, com o rótulo que a tela mostra. */
export const CHAVES_DA_META: ChaveDaMeta[] = [
  ...COMPONENTES_DA_META.map((c) => ({ key: chaveDoPeso(c.key), tipo: 'PESO' as const, rotulo: `Peso — ${c.name}`, componente: c.key })),
  ...COMPONENTES_DA_META.map((c) => ({ key: chaveDoStatus(c.key), tipo: 'STATUS' as const, rotulo: `Status — ${c.name}`, componente: c.key })),
  { key: CHAVE_FORA_DO_PRAZO, tipo: 'DESCONTO', rotulo: 'Desconto — Fora do prazo (% por lançamento corrigido)' },
  { key: CHAVE_ESCALA_GERENTES, tipo: 'DESCONTO', rotulo: 'Desconto — Escala de gerentes (% por gerente sem folga)' },
  ...PARAMETROS_DA_AUDITORIA.map((p) => ({ key: p.key, tipo: 'PARAMETRO' as const, rotulo: `Auditoria de atestados — ${p.rotulo}`, componente: 'CERTIFICATES' })),
];
export const rotuloDaChave = (key: string) => CHAVES_DA_META.find((c) => c.key === key)?.rotulo ?? key;
export const tipoDaChave = (key: string): TipoDeChave | null => CHAVES_DA_META.find((c) => c.key === key)?.tipo ?? null;
/** O valor como a tela lê: status com rótulo, número com vírgula. */
export function valorLegivel(key: string, value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  if (tipoDaChave(key) === 'STATUS') return ROTULO_STATUS[normalizarStatus(value) ?? 'ATIVO'] ?? value;
  const n = Number(value);
  const sufixo = tipoDaChave(key) === 'DESCONTO' || key.startsWith('CERT_AUDIT_PENALTY') ? '%' : key === CHAVE_PRAZO_ATESTADOS ? ' h' : '';
  return Number.isFinite(n) ? String(n).replace('.', ',') + sufixo : value;
}

/** Linha-base: o valor que valia antes de existir histórico, válido para qualquer mês. */
export const VIGENCIA_BASE = '0000-01';
export const MOTIVO_MIN = 10;
export const motivoValido = (m: unknown) => String(m ?? '').trim().length >= MOTIVO_MIN;
export const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
/** A vigência é um mês e nunca um período já encerrado: ≥ o mês corrente. */
export function vigenciaValida(validFrom: unknown, mesAtual: string): boolean {
  const v = String(validFrom ?? '');
  return MES_RE.test(v) && v >= mesAtual;
}
/** Os meses que a tela oferece como vigência: o corrente e os `n` seguintes. */
export function mesesDeVigencia(mesAtual: string, n = 3): string[] {
  const [y, m] = mesAtual.split('-').map(Number);
  return Array.from({ length: n + 1 }, (_, i) => new Date(Date.UTC(y, m - 1 + i, 1)).toISOString().slice(0, 7));
}

export interface EntradaDeVigencia { value: string; validFrom: string; createdAt: Date | string }
/** A entrada que vale no mês pedido (maior `validFrom` ≤ mês; empate = a mais recente), ou nula. */
export function valorVigente<T extends EntradaDeVigencia>(entradas: T[], yearMonth: string): T | null {
  let melhor: T | null = null;
  for (const e of entradas) {
    if (e.validFrom > yearMonth) continue;
    if (!melhor || e.validFrom > melhor.validFrom || (e.validFrom === melhor.validFrom && new Date(e.createdAt).getTime() > new Date(melhor.createdAt).getTime())) melhor = e;
  }
  return melhor;
}

/** Número a partir do texto gravado: inteiro ≥ 0 (peso) ou decimal com teto (desconto). */
export function lerNumero(value: string | null | undefined, def: number, opts: { inteiro?: boolean; teto?: number } = {}): number {
  if (value == null || value === '') return def;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return def;
  const v = opts.inteiro ? Math.trunc(n) : n;
  return opts.teto != null ? Math.min(opts.teto, v) : v;
}
