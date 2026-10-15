import { rhSaidaBase, rhSaidaToken } from '@/lib/rh/saida/config';

/**
 * Transporte do envio SGO → GBF-RH: POST/GET JSON com `Authorization: Bearer`
 * e teto de 20 s (o RH roda no Replit e pode estar dormindo — sem teto, uma
 * conexão pendurada segura o despachante inteiro).
 *
 * Falha de REDE/tempo vira `RhSaidaTransporteError` (temporária, o despachante
 * adia). Resposta HTTP, qualquer que seja o status, volta como `{status, corpo}`
 * — quem decide o que ela significa é `classificarResposta` (regras.ts).
 * O token nunca aparece em mensagem de erro.
 */
export const TIMEOUT_MS = 20_000;

export class RhSaidaTransporteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RhSaidaTransporteError';
  }
}

export interface RespostaRh {
  status: number;
  corpo: unknown;
}

async function chamar(metodo: 'POST' | 'GET', caminho: string, body?: unknown): Promise<RespostaRh> {
  const url = `${rhSaidaBase()}${caminho}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${rhSaidaToken()}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const nome = e instanceof Error ? e.name : '';
    const msg = nome === 'TimeoutError' || nome === 'AbortError'
      ? `RH não respondeu em ${TIMEOUT_MS / 1000}s`
      : `falha de rede ao chamar o RH (${e instanceof Error ? e.message : String(e)})`;
    throw new RhSaidaTransporteError(msg);
  }
  const texto = await res.text().catch(() => '');
  let corpo: unknown = texto;
  if (texto) {
    try { corpo = JSON.parse(texto); } catch { /* texto cru */ }
  }
  return { status: res.status, corpo };
}

export function postRh(caminho: string, body: unknown): Promise<RespostaRh> {
  return chamar('POST', caminho, body);
}

export function getRh(caminho: string): Promise<RespostaRh> {
  return chamar('GET', caminho);
}
