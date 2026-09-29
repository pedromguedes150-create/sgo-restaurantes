import { prisma } from '@/lib/db/prisma';
import { decifrar } from '@/lib/conexoes/cripto';
import { caminhoValido, encurtarErro, type TipoDeAuth } from '@/lib/conexoes/formato';

/**
 * O cliente de SAÍDA (v1.131.0): toda chamada que este SGO faz a outro sistema
 * cadastrado na Central passa por aqui — e só por aqui vê a credencial.
 *
 * Espelho de `api-global/guarda.ts`: lá, cada chamada RECEBIDA vira uma linha
 * em `api_request_logs`; aqui, cada chamada FEITA vira uma linha em
 * `external_request_logs` (sistema, método, caminho, status, duração, ok/erro).
 * A credencial nunca entra no log nem na mensagem de erro: ela só existe no
 * header, e as falhas de rede não ecoam headers.
 *
 * ⚠️ Nesta etapa NENHUMA integração de produção chama isto. O sync do RH segue
 * no cliente v1 do `.env`; a Central só administra e testa. A migração vem
 * depois, conexão a conexão.
 */

const TIMEOUT_MS = 20_000;

export interface AlvoDaChamada {
  connectionId: string | null;
  connectionName: string;
  baseUrl: string;
  authType: TipoDeAuth;
  authHeader: string;
  credential: string;
}

export interface OpcoesDaChamada {
  method?: 'GET' | 'POST';
  path?: string;
  body?: unknown;
  timeoutMs?: number;
  /** Só para testes: substitui o `fetch` global. */
  fetchImpl?: typeof fetch;
}

export interface ChamadaExterna {
  ok: boolean;
  status: number | null;
  durationMs: number;
  data: unknown;
  error: string | null;
}

function headersDeAuth(alvo: AlvoDaChamada): Record<string, string> {
  return alvo.authType === 'BEARER'
    ? { Authorization: `Bearer ${alvo.credential}` }
    : { [alvo.authHeader]: alvo.credential };
}

/** Faz a chamada, registra o log e devolve o resultado. Nunca lança por falha de rede — devolve `ok: false`. */
export async function executarChamada(alvo: AlvoDaChamada, opts: OpcoesDaChamada = {}): Promise<ChamadaExterna> {
  const method = opts.method ?? 'GET';
  const path = opts.path ?? '/';
  const inicio = Date.now();
  const fetchImpl = opts.fetchImpl ?? fetch;
  let resultado: ChamadaExterna;

  if (!caminhoValido(path)) {
    resultado = { ok: false, status: null, durationMs: 0, data: null, error: 'Caminho inválido' };
  } else {
    try {
      const res = await fetchImpl(`${alvo.baseUrl}${path}`, {
        method,
        headers: { ...headersDeAuth(alvo), Accept: 'application/json', ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        cache: 'no-store',
        signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
      });
      const texto = await res.text().catch(() => '');
      let data: unknown = texto;
      try { data = texto ? JSON.parse(texto) : null; } catch { /* resposta não-JSON fica como texto */ }
      const erroDoCorpo = data && typeof data === 'object' && !Array.isArray(data)
        ? ((data as { error?: unknown; message?: unknown }).error ?? (data as { message?: unknown }).message)
        : null;
      resultado = {
        ok: res.ok,
        status: res.status,
        durationMs: Date.now() - inicio,
        data,
        error: res.ok ? null : encurtarErro(typeof erroDoCorpo === 'string' ? erroDoCorpo : `HTTP ${res.status}`),
      };
    } catch (e) {
      const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
      resultado = {
        ok: false, status: null, durationMs: Date.now() - inicio, data: null,
        error: timeout ? `Sem resposta em ${(opts.timeoutMs ?? TIMEOUT_MS) / 1000}s` : encurtarErro(e instanceof Error ? e.message : String(e)),
      };
    }
  }

  await prisma.externalRequestLog.create({
    data: {
      connectionId: alvo.connectionId, connectionName: alvo.connectionName, method, path,
      status: resultado.status, durationMs: resultado.durationMs, ok: resultado.ok, error: resultado.error,
    },
  }).catch(() => {});

  if (alvo.connectionId) {
    await prisma.externalConnection.update({
      where: { id: alvo.connectionId },
      data: { lastUsedAt: new Date(), lastStatus: resultado.status, lastOk: resultado.ok, lastResult: resultado.error },
    }).catch(() => {});
  }
  return resultado;
}

export class ConexaoIndisponivelError extends Error {
  readonly reason: 'NOT_FOUND' | 'INACTIVE';
  constructor(reason: 'NOT_FOUND' | 'INACTIVE') {
    super(reason === 'NOT_FOUND' ? 'Conexão não encontrada' : 'Conexão desativada');
    this.name = 'ConexaoIndisponivelError';
    this.reason = reason;
  }
}

/** Chama uma conexão CADASTRADA pelo id. Recusa conexão inexistente ou desativada. */
export async function chamarConexao(id: string, opts: OpcoesDaChamada = {}): Promise<ChamadaExterna> {
  const c = await prisma.externalConnection.findUnique({ where: { id } });
  if (!c) throw new ConexaoIndisponivelError('NOT_FOUND');
  if (!c.active) throw new ConexaoIndisponivelError('INACTIVE');
  return executarChamada({
    connectionId: c.id, connectionName: c.name, baseUrl: c.baseUrl,
    authType: c.authType, authHeader: c.authHeader, credential: await decifrar(c.credentialEnc),
  }, opts);
}
