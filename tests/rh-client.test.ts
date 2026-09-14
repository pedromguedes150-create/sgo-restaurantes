import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';

/**
 * O TRANSPORTE da API do RH.
 *
 * Duas coisas se medem aqui, e as duas são sobre falha — o caminho feliz já é
 * exercitado pelo sync:
 *
 * 1. **Teto de espera.** O `rhGet` não tinha nenhum. O RH roda no Replit, que
 *    hiberna o app ocioso; e o sync diário percorre as unidades EM SÉRIE, então
 *    uma conexão pendurada segura a fila inteira sem erro no log.
 * 2. **Toda falha vira `RhApiError`.** É o que faz o sync abortar a unidade em
 *    vez de seguir adiante com uma lista vazia e desligar todo mundo.
 */

/* A chave é lida uma vez, na carga do módulo — por isso o env vem antes do
   import dinâmico lá embaixo. */
process.env.RH_API_KEY = 'chave-de-teste';
process.env.RH_API_BASE_URL = 'https://rh-de-teste.local';

type Cliente = typeof import('@/lib/rh/client');
let client: Cliente;

beforeAll(async () => { client = await import('@/lib/rh/client'); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('Teto de espera', () => {
  it('o pedido leva um AbortSignal com prazo — sem ele o sync fica pendurado', async () => {
    let recebido: RequestInit | undefined;
    vi.stubGlobal('fetch', async (_u: string, init?: RequestInit) => {
      recebido = init;
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    await client.rhGet('/api/ext/colaboradores');
    expect(recebido?.signal, 'a requisição saiu sem signal').toBeDefined();
    expect(recebido?.signal?.aborted).toBe(false);
  });

  it('estouro de tempo vira RhApiError 504, com a espera na mensagem', async () => {
    vi.stubGlobal('fetch', async () => {
      /* O que o AbortSignal.timeout produz quando o prazo estoura. */
      const e = new Error('The operation was aborted due to timeout');
      e.name = 'TimeoutError';
      throw e;
    });

    await expect(client.rhGet('/api/ext/colaboradores')).rejects.toMatchObject({
      name: 'RhApiError',
      status: 504,
    });
    await expect(client.rhGet('/api/ext/colaboradores')).rejects.toThrow(/não respondeu em \d+s/);
  });

  it('queda de rede vira RhApiError 503 — e não passa batido como sucesso', async () => {
    vi.stubGlobal('fetch', async () => { throw new TypeError('fetch failed'); });
    await expect(client.rhGet('/api/ext/colaboradores')).rejects.toMatchObject({
      name: 'RhApiError',
      status: 503,
    });
  });
});

describe('Respostas do RH', () => {
  it('HTTP de erro vira RhApiError com a mensagem que o RH mandou', async () => {
    vi.stubGlobal('fetch', async () => new Response(
      JSON.stringify({ success: false, error: 'Unauthorized: API key inválida ou ausente.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    ));
    await expect(client.rhGet('/api/ext/colaboradores')).rejects.toThrow(/API key inválida/);
  });

  it('200 com { success: false } TAMBÉM é falha — o RH responde assim', async () => {
    /* Medido contra o RH real em 14/09: o envelope de erro é
       { success:false, error }. Tratar isso como sucesso entregaria um corpo
       sem `data` ao sync. */
    vi.stubGlobal('fetch', async () => new Response(
      JSON.stringify({ success: false, error: 'Unidade não encontrada' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    await expect(client.rhGet('/api/ext/colaboradores')).rejects.toThrow(/Unidade não encontrada/);
  });

  it('sem chave configurada nem chega a sair da máquina', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('não deveria ter chamado a rede'); });
    vi.resetModules();
    const semChave = process.env.RH_API_KEY;
    process.env.RH_API_KEY = '';
    const c2: Cliente = await import('@/lib/rh/client');
    await expect(c2.rhGet('/api/ext/colaboradores')).rejects.toThrow(/não configurada/);
    process.env.RH_API_KEY = semChave;
    vi.resetModules();
  });
});
