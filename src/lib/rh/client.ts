/**
 * Cliente da API do RH (GBF RH) — Módulo 9.
 *
 * Camada de TRANSPORTE apenas (independente do formato dos campos).
 * Lê base URL e chave do .env (RH_API_BASE_URL, RH_API_KEY).
 * Autenticação por header `x-api-key`. Envelope de erro: { success:false, error }.
 *
 * A NORMALIZAÇÃO (mapear os campos do RH → modelos do SGO) fica em rh/normalize.ts
 * e só será preenchida quando confirmarmos o formato exato das respostas.
 *
 * V2 (23/09/2026): o RH publicou um segundo prefixo, `/api/ext/v2/rh`, com
 * chave própria (RH_API_V2_URL / RH_API_V2_KEY). O TRANSPORTE é o mesmo — o
 * header `x-api-key` foi confirmado pelo `Vary: x-api-key` da resposta —, mas
 * o formato das respostas ainda não foi visto: a chave respondia 401 no dia em
 * que isto foi escrito. Por isso a v2 entra aqui como `rhGetV2` + diagnóstico,
 * e NADA do sync ou da normalização passa a usá-la até o formato ser validado
 * com uma unidade real. A v1 continua sendo a produção.
 */

const BASE = process.env.RH_API_BASE_URL ?? 'https://gbf-rh.replit.app';
const KEY = process.env.RH_API_KEY ?? '';

const BASE_V2 = (process.env.RH_API_V2_URL ?? 'https://gbf-rh.replit.app/api/ext/v2/rh').replace(/\/+$/, '');
const KEY_V2 = process.env.RH_API_V2_KEY ?? '';

export function rhConfigured(): boolean {
  return Boolean(KEY);
}

export function rhV2Configured(): boolean {
  return Boolean(KEY_V2);
}

/** Base da v2 para exibição (sem segredo). */
export function rhV2Base(): string {
  return BASE_V2;
}

export class RhApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'RhApiError';
    this.status = status;
  }
}

/**
 * Teto de espera por requisição.
 *
 * Sem isto o `fetch` espera indefinidamente. O RH roda no Replit, que hiberna o
 * app quando fica ocioso: uma requisição que pega o app dormindo pode ficar
 * pendurada, e como o sync diário percorre as unidades em série, UMA conexão
 * presa segura a fila inteira sem erro nenhum no log. 20s é folgado — hoje os
 * endpoints respondem em menos de 1s.
 */
const TIMEOUT_MS = 20_000;

interface Transporte {
  base: string;
  key: string;
  /** Nome da variável de ambiente da chave, para a mensagem de "não configurada". */
  keyVar: string;
  /** `true` ignora o cache de 60s — para o ping de diagnóstico, que quer a resposta de AGORA. */
  fresh?: boolean;
}

/** O núcleo de transporte, comum à v1 e à v2. Lança RhApiError em falha. */
async function doGet<T>(t: Transporte, path: string): Promise<T> {
  if (!t.key) throw new RhApiError(`${t.keyVar} não configurada`, 401);
  const url = `${t.base}${path.startsWith('/') ? '' : '/'}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'x-api-key': t.key, Accept: 'application/json' },
      // dados do RH mudam pouco; cache curto evita martelar a API a cada render
      ...(t.fresh ? { cache: 'no-store' as const } : { next: { revalidate: 60 } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    /* Estouro de tempo e queda de rede viram RhApiError como qualquer outra
       falha de transporte — quem chama já sabe tratar e, no sync, isso ABORTA
       a unidade em vez de seguir com uma lista vazia. */
    const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    throw new RhApiError(
      timeout ? `RH não respondeu em ${TIMEOUT_MS / 1000}s` : `Falha de rede ao consultar o RH: ${e instanceof Error ? e.message : String(e)}`,
      timeout ? 504 : 503,
    );
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || (data && typeof data === 'object' && 'success' in data && data.success === false)) {
    const msg = (data && (data as { error?: string }).error) || `Falha RH (${res.status})`;
    throw new RhApiError(msg, res.status);
  }
  return data as T;
}

/** GET genérico autenticado na v1. Lança RhApiError em falha. */
export async function rhGet<T = unknown>(path: string): Promise<T> {
  return doGet<T>({ base: BASE, key: KEY, keyVar: 'RH_API_KEY' }, path);
}

/**
 * GET genérico autenticado na v2. Mesmo transporte, outra base e outra chave.
 * `path` é relativo ao prefixo da v2 (ex.: '/colaboradores').
 */
export async function rhGetV2<T = unknown>(path: string, opts: { fresh?: boolean } = {}): Promise<T> {
  return doGet<T>({ base: BASE_V2, key: KEY_V2, keyVar: 'RH_API_V2_KEY', fresh: opts.fresh }, path);
}

/* ───────── Endpoints (retornam o JSON cru; tipagem refinada após confirmar) ─────────
 * Colaboradores:
 *   GET /api/ext/colaboradores
 *   GET /api/ext/colaboradores/unidades
 *   GET /api/ext/colaboradores/unidade/:unidade
 *   GET /api/ext/colaboradores/escala/:unidade
 *   GET /api/ext/colaboradores/:id
 * Financeiro:
 *   GET /api/ext/financeiro/folha | /vale-transporte | /beneficios | /historico/:id ...
 */
export const rh = {
  colaboradores: () => rhGet('/api/ext/colaboradores'),
  unidades: () => rhGet('/api/ext/colaboradores/unidades'),
  colaboradoresDaUnidade: (unidade: string) => rhGet(`/api/ext/colaboradores/unidade/${encodeURIComponent(unidade)}`),
  escala: (unidade: string) => rhGet(`/api/ext/colaboradores/escala/${encodeURIComponent(unidade)}`),
  colaborador: (id: string) => rhGet(`/api/ext/colaboradores/${encodeURIComponent(id)}`),
  // Financeiro (Comissões/Mobilidade — a confirmar onde estão)
  folha: () => rhGet('/api/ext/financeiro/folha'),
  beneficios: () => rhGet('/api/ext/financeiro/beneficios'),
  valeTransporte: () => rhGet('/api/ext/financeiro/vale-transporte'),
  historico: (colaboradorId: string) => rhGet(`/api/ext/financeiro/historico/${encodeURIComponent(colaboradorId)}`),
};

/**
 * v2 — ainda sem endpoints nomeados de propósito: nomear `colaboradores()`
 * antes de ver a resposta seria chutar caminho e formato. Quem precisar usa
 * `raw(path)`; os nomes entram quando o diagnóstico mostrar o que existe.
 */
export const rhV2 = {
  raw: <T = unknown>(path: string) => rhGetV2<T>(path),
};
