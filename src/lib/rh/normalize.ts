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

/** O RH respondeu 200, mas num formato que não sabemos ler. */
export class RhFormatoInesperadoError extends Error {
  constructor(amostra: string) {
    super(`Resposta do RH em formato inesperado (esperado { data: [...] }): ${amostra}`);
    this.name = 'RhFormatoInesperadoError';
  }
}

/**
 * Lista de colaboradores do envelope `{ data: [...] }`.
 *
 * **Formato irreconhecível LANÇA, não devolve lista vazia.** Devolver `[]` aqui
 * era o mais perigoso: quem chama não tem como distinguir "esta unidade não tem
 * ninguém" de "o RH mudou o envelope e eu não entendi nada". O sync usa a lista
 * para decidir quem inativar — então uma mudança de formato no lado do RH
 * apagaria a unidade inteira, calada. Erro para o sync abortar a unidade.
 */
export function unwrapColaboradores(resp: unknown): RhColaborador[] {
  const d = (resp as RhEnvelope<unknown>)?.data;
  if (Array.isArray(d)) return d as RhColaborador[];
  const amostra = JSON.stringify(resp ?? null)?.slice(0, 200) ?? 'null';
  throw new RhFormatoInesperadoError(amostra);
}

export function isAtivo(status: string | null | undefined): boolean {
  return (status ?? '').trim().toLowerCase().startsWith('ativ');
}
