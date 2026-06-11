/**
 * Cliente da API do RH (GBF RH) — Módulo 9.
 *
 * Camada de TRANSPORTE apenas (independente do formato dos campos).
 * Lê base URL e chave do .env (RH_API_BASE_URL, RH_API_KEY).
 * Autenticação por header `x-api-key`. Envelope de erro: { success:false, error }.
 *
 * A NORMALIZAÇÃO (mapear os campos do RH → modelos do SGO) fica em rh/normalize.ts
 * e só será preenchida quando confirmarmos o formato exato das respostas.
 */

const BASE = process.env.RH_API_BASE_URL ?? 'https://gbf-rh.replit.app';
const KEY = process.env.RH_API_KEY ?? '';

export function rhConfigured(): boolean {
  return Boolean(KEY);
}

export class RhApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'RhApiError';
    this.status = status;
  }
}

/** GET genérico autenticado. Lança RhApiError em falha. */
export async function rhGet<T = unknown>(path: string): Promise<T> {
  if (!KEY) throw new RhApiError('RH_API_KEY não configurada', 401);
  const url = `${BASE}${path.startsWith('/') ? '' : '/'}${path}`;
  const res = await fetch(url, {
    headers: { 'x-api-key': KEY, Accept: 'application/json' },
    // dados do RH mudam pouco; cache curto evita martelar a API a cada render
    next: { revalidate: 60 },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || (data && typeof data === 'object' && 'success' in data && data.success === false)) {
    const msg = (data && (data as { error?: string }).error) || `Falha RH (${res.status})`;
    throw new RhApiError(msg, res.status);
  }
  return data as T;
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
