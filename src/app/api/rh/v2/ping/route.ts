import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { pathDePingValido, pingRhV2 } from '@/lib/rh/v2-ping';

/**
 * Ping da API v2 do RH (Admin/CEO) — disponível TAMBÉM em produção.
 *
 * Diferente de `/api/rh/test`, não devolve dado nenhum do RH: só status, erro e
 * a forma da resposta (nomes de campos). É o que permite testar, do droplet, se
 * a v2 aceita a chave — hipótese de lista de IPs que não dá para verificar de
 * fora.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  if (user.role !== 'ADMIN' && user.role !== 'CEO') return NextResponse.json({ error: 'Apenas Admin/CEO' }, { status: 403 });

  const path = new URL(req.url).searchParams.get('path') ?? '/colaboradores';
  if (!pathDePingValido(path)) return NextResponse.json({ error: 'Caminho inválido' }, { status: 400 });

  return NextResponse.json(await pingRhV2(path));
}
