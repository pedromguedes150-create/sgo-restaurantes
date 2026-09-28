import { NextResponse } from 'next/server';
import { autenticarApiKey, registrarChamada } from '@/lib/api-global/chaves';

export interface ClienteDaApi { id: string; name: string }

/**
 * A porta de TODA rota /api/v1 (v1.129.0): valida a X-API-Key, executa o
 * handler com o sistema identificado e registra a chamada (quem, o quê,
 * quando, status). Sem chave ou chave inválida → 401, também registrado,
 * como "não autenticado" — sem a chave apresentada.
 *
 * Uma rota nova da API Global é `export const GET = comApiKey(async (req, cliente) => …)`.
 */
export function comApiKey(handler: (req: Request, cliente: ClienteDaApi) => Promise<Response>) {
  return async function (req: Request): Promise<Response> {
    const inicio = Date.now();
    const { pathname } = new URL(req.url);
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
    const auth = await autenticarApiKey(req);
    if (!auth.ok) {
      const res = NextResponse.json({ error: 'Não autorizado', detail: 'Envie uma chave válida no header X-API-Key.' }, { status: 401 });
      await registrarChamada({ clientId: null, clientName: 'não autenticado', method: req.method, path: pathname, status: 401, durationMs: Date.now() - inicio, ip });
      return res;
    }
    let res: Response;
    try {
      res = await handler(req, auth.client);
    } catch {
      res = NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    }
    await registrarChamada({ clientId: auth.client.id, clientName: auth.client.name, method: req.method, path: pathname, status: res.status, durationMs: Date.now() - inicio, ip });
    return res;
  };
}
