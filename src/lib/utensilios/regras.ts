/**
 * INVENTÁRIO DE UTENSÍLIOS (v1.177.0) — as regras PURAS.
 *
 * Um formulário de contagem, não um estoque: o gerente conta, o supervisor
 * (ou coordenador) confere, aprova ou devolve. Quatro situações e nada mais:
 * RASCUNHO → PENDENTE → APROVADO, com EM_CORRECAO no meio quando devolvido.
 *
 * Decisões do Pedro (21/10/2026): Coordenador e Supervisor auditam igual; a
 * contagem é mensal ou trimestral e entra na meta com peso 0 até ele calibrar;
 * a aba substitui o "Inventário" antigo no menu do gerente (o Teknisa e os
 * equipamentos continuam na tela deles, só saem do caminho).
 *
 * ⚠️ Quantidade ZERO é diferente de "não conferido": o campo nasce vazio
 * (`null`) e o envio exige que todos estejam preenchidos — zero inclusive.
 */

export type StatusInventario = 'RASCUNHO' | 'PENDENTE' | 'EM_CORRECAO' | 'APROVADO';

export const ROTULO_STATUS: Record<StatusInventario, string> = {
  RASCUNHO: 'Rascunho', PENDENTE: 'Pendente de auditoria', EM_CORRECAO: 'Em correção', APROVADO: 'Aprovado',
};
export const TOM_STATUS: Record<StatusInventario, 'neutral' | 'warning' | 'danger' | 'success'> = {
  RASCUNHO: 'neutral', PENDENTE: 'warning', EM_CORRECAO: 'danger', APROVADO: 'success',
};

/** A lista inicial (semente). O Admin edita depois em Configurações → Utensílios. */
export const ITENS_PADRAO = [
  'Pratos — Cliente', 'Pratos — Refeitório', 'Pratos — Sobremesa', 'Cubas', 'Facas', 'Garfos', 'Colheres',
  'Copos — Lagoinha', 'Copos — 300 ml', 'Xícaras G', 'Xícaras P', 'Pires G', 'Pires P', 'Jarras — 1 litro', 'Jarras — 1/2 litro',
] as const;

/** Quem conta (abre, salva, envia): a operação da unidade. */
export const PODE_CONTAR = new Set(['MANAGER', 'COORDINATOR', 'SUPERVISOR', 'ADMIN', 'CEO']);
/** Quem audita (aprova, devolve, registra conferência): Supervisor e Coordenador, iguais (decisão do Pedro), + Admin/CEO. */
export const PODE_AUDITAR = new Set(['SUPERVISOR', 'COORDINATOR', 'ADMIN', 'CEO']);
/** Gerente responsável: usuário da unidade com um destes perfis. */
export const PERFIS_RESPONSAVEL = ['MANAGER', 'COORDINATOR'] as const;

/** Situações em que o gerente ainda pode mexer. */
export const EDITAVEL: ReadonlySet<StatusInventario> = new Set(['RASCUNHO', 'EM_CORRECAO']);
/** Situações "em aberto": só uma por unidade de cada vez. */
export const EM_ABERTO: ReadonlySet<StatusInventario> = new Set(['RASCUNHO', 'PENDENTE', 'EM_CORRECAO']);

export const MOTIVO_MIN = 5;
export const QUANTIDADE_MAX = 999_999;

export interface ItemContado { id?: string; catalogItemId?: string | null; name: string; quantity: number | null; custom: boolean; note?: string | null; order?: number }

/** Quantidade válida: inteiro ≥ 0 (ou nulo = não conferido). Texto vazio é nulo; "12" é 12; "-1"/"1,5"/"abc" são inválidos. */
export function normalizarQuantidade(v: unknown): { ok: true; valor: number | null } | { ok: false } {
  if (v === null || v === undefined || v === '') return { ok: true, valor: null };
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  if (!Number.isInteger(n) || n < 0 || n > QUANTIDADE_MAX) return { ok: false };
  return { ok: true, valor: n };
}

/** Nome de item personalizado: 2 a 80 caracteres, sem repetir um da lista (sem acento/caixa). */
export function nomeValido(nome: string, existentes: string[]): { ok: true; nome: string } | { ok: false; motivo: string } {
  const n = nome.trim().replace(/\s+/g, ' ');
  if (n.length < 2 || n.length > 80) return { ok: false, motivo: 'Nome do utensílio com 2 a 80 caracteres.' };
  const chave = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (existentes.some((e) => chave(e) === chave(n))) return { ok: false, motivo: `"${n}" já está na lista.` };
  return { ok: true, nome: n };
}

/** O que falta para enviar: todo item (padrão e personalizado) com quantidade informada. */
export function faltamParaEnviar(itens: ItemContado[]): string[] {
  return itens.filter((i) => i.quantity === null || i.quantity === undefined).map((i) => i.name);
}

export function totalDeUtensilios(itens: { quantity: number | null }[]): number {
  return itens.reduce((s, i) => s + (i.quantity ?? 0), 0);
}

/** Diferença conferência − declarado; nula quando o supervisor não contou aquele item. */
export function diferenca(declarado: number | null, auditado: number | null): number | null {
  if (declarado === null || auditado === null) return null;
  return auditado - declarado;
}

export function contarDivergencias(itens: { quantity: number | null; auditedQuantity: number | null }[]): { conferidos: number; divergentes: number } {
  let conferidos = 0; let divergentes = 0;
  for (const i of itens) { const d = diferenca(i.quantity, i.auditedQuantity); if (d === null) continue; conferidos++; if (d !== 0) divergentes++; }
  return { conferidos, divergentes };
}

/** Transições permitidas — a única tabela que decide status. */
export function proximoStatus(atual: StatusInventario, acao: 'enviar' | 'devolver' | 'aprovar'): StatusInventario | null {
  if (acao === 'enviar') return EDITAVEL.has(atual) ? 'PENDENTE' : null;
  if (acao === 'devolver') return atual === 'PENDENTE' ? 'EM_CORRECAO' : null;
  if (acao === 'aprovar') return atual === 'PENDENTE' ? 'APROVADO' : null;
  return null;
}

export function motivoValido(m: string | null | undefined): boolean { return (m ?? '').trim().length >= MOTIVO_MIN; }

/** Retrato dos itens para o evento de envio: o original fica preservado mesmo depois de corrigido. */
export function retrato(itens: { name: string; quantity: number | null; custom: boolean }[]): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const i of itens) out[i.custom ? `${i.name} (adicionado)` : i.name] = i.quantity;
  return out;
}
