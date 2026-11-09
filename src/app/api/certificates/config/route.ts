import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { atualizarConfigDaNomenclatura, listarConfigDasNomenclaturas } from '@/lib/certificates/config-nomenclaturas';

/**
 * v1.198.0 — Configurações → Atestados e afins: a correspondência por
 * nomenclatura (nome no RH, ativa, dias da regra). GET lista; POST grava uma.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  return NextResponse.json({ nomenclaturas: await listarConfigDasNomenclaturas() });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const b = await req.json().catch(() => null);
  if (!b || typeof b.nomenclatura !== 'string') return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const r = await atualizarConfigDaNomenclatura(user, b.nomenclatura, {
    rhName: b.rhName === undefined ? undefined : (typeof b.rhName === 'string' ? b.rhName : null),
    active: typeof b.active === 'boolean' ? b.active : undefined,
    ruleDays: b.ruleDays === undefined ? undefined : (b.ruleDays === null || b.ruleDays === '' ? null : Number(b.ruleDays)),
    notes: b.notes === undefined ? undefined : (typeof b.notes === 'string' ? b.notes : null),
  }, requestContext(req));
  if (!r.ok) return NextResponse.json({ error: r.message ?? (r.reason === 'FORBIDDEN' ? 'Só o Administrador configura as nomenclaturas.' : r.reason === 'NOT_FOUND' ? 'Nomenclatura fora do catálogo.' : 'Dados inválidos.') }, { status: r.reason === 'FORBIDDEN' ? 403 : r.reason === 'NOT_FOUND' ? 404 : 400 });
  return NextResponse.json({ ok: true });
}
