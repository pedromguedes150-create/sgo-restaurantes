/**
 * Normalização das respostas do RH (GBF RH) → modelos do SGO.
 * Formatos confirmados em 2026-06-11 via /api/rh/test.
 * Envelope padrão: { data: T }.
 */

export interface RhEnvelope<T> {
  data: T;
}

/** /api/ext/colaboradores e /escala/:unidade e /unidade/:unidade */
export interface RhColaborador {
  matricula: string;
  nome: string;
  cpf: string | null;
  status: string; // "Ativo" | ...
  unidade: string; // razão social
  cargo: string | null;
  admissao: string | null; // 'YYYY-MM-DD'
}

/** /api/ext/colaboradores/unidades → { data: string[] } (razões sociais) */
export function unwrapUnidades(resp: unknown): string[] {
  const d = (resp as RhEnvelope<unknown>)?.data;
  return Array.isArray(d) ? (d as string[]) : [];
}

export function unwrapColaboradores(resp: unknown): RhColaborador[] {
  const d = (resp as RhEnvelope<unknown>)?.data;
  return Array.isArray(d) ? (d as RhColaborador[]) : [];
}

export function isAtivo(status: string | null | undefined): boolean {
  return (status ?? '').trim().toLowerCase().startsWith('ativ');
}
