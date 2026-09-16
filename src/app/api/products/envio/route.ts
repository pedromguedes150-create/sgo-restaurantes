import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { requestContext } from '@/lib/auth/service';
import { confirmarEnvio } from '@/lib/products/entrega';

/**
 * A saída da carga do CD.
 *
 * Fica numa rota própria — e não junto do recebimento — porque a matriz cobra
 * módulos diferentes dos dois lados: dar saída é do CD (`PRODUCT_SEPARATION`),
 * conferir é da unidade (`PRODUCTS`). Uma rota só teria de escolher um dono.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const b = await req.json().catch(() => null);
  if (!b?.requestId) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });

  const r = await confirmarEnvio(user, String(b.requestId), b.cdNote ? String(b.cdNote) : null, requestContext(req));
  if (r.ok) return NextResponse.json({ ok: true, status: r.status });

  const status: Record<string, number> = { FORBIDDEN: 403, NAO_ENCONTRADO: 404, FORA_DE_ORDEM: 409, INVALID: 400 };
  return NextResponse.json({ error: r.detalhe ?? 'Não foi possível confirmar o envio', reason: r.reason }, { status: status[r.reason] ?? 400 });
}
