import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { alternarSabor, criarSabor, excluirSabor, renomearSabor, type ResultadoCatalogo } from '@/lib/pizzas/catalogo';

/**
 * Catálogo de sabores — AUTENTICADA, ao contrário de `/api/pizzas`.
 *
 * Mora sob o prefixo público do fechamento, como `/api/higiene/manage` mora sob
 * `/api/higiene`: o middleware é só a checagem barata do edge, e quem manda é a
 * sessão verificada aqui mais a matriz de perfis.
 */

const STATUS: Record<string, number> = { FORBIDDEN: 403, INVALID: 400, CONFLICT: 409, BLOCKED: 422 };
const PADRAO: Record<string, string> = {
  FORBIDDEN: 'Sem permissão',
  INVALID: 'Dados inválidos',
  CONFLICT: 'Já existe',
  BLOCKED: 'Operação bloqueada',
};

function resposta(r: ResultadoCatalogo) {
  if (r.ok) return NextResponse.json({ ok: true, id: r.id });
  return NextResponse.json({ error: r.message ?? PADRAO[r.reason], reason: r.reason }, { status: STATUS[r.reason] ?? 400 });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  switch (b.action) {
    case 'create':
      return resposta(await criarSabor(user, { unitId: String(b.unitId ?? ''), name: String(b.name ?? '') }, ctx));
    case 'rename':
      return resposta(await renomearSabor(user, { id: String(b.id ?? ''), name: String(b.name ?? '') }, ctx));
    case 'toggle':
      return resposta(await alternarSabor(user, { id: String(b.id ?? ''), active: b.active === true }, ctx));
    case 'delete':
      return resposta(await excluirSabor(user, String(b.id ?? ''), ctx));
    default:
      return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
  }
}
