import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { createPayout } from '@/lib/people/payouts';
import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';

/** GET ?collaboratorId= — histórico de lançamentos do colaborador (p/ variação ao lançar). */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const collaboratorId = new URL(req.url).searchParams.get('collaboratorId');
  if (!collaboratorId) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const collab = await prisma.collaborator.findUnique({ where: { id: collaboratorId }, select: { units: { select: { unitId: true } } } });
  if (!collab || !collab.units.some((u) => canAccessUnit(user, u.unitId))) return NextResponse.json({ history: [] });
  const rows = await prisma.collaboratorPayout.findMany({
    where: { collaboratorId },
    orderBy: [{ yearMonth: 'desc' }, { createdAt: 'desc' }],
    take: 12,
  });
  return NextResponse.json({
    history: rows.map((r) => ({ yearMonth: r.yearMonth, type: r.type, amount: Number(r.amount), note: r.note })),
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.collaboratorId || !b?.type || !b?.yearMonth) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const r = await createPayout(user, {
    collaboratorId: String(b.collaboratorId), type: b.type, yearMonth: String(b.yearMonth),
    amount: Number(b.amount), note: b.note,
  }, requestContext(req));
  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400 };
    const msg = r.reason === 'FORBIDDEN' ? 'Apenas Supervisão/Admin lançam comissões e mobilidade' : r.reason === 'NOT_FOUND' ? 'Colaborador não encontrado' : 'Dados inválidos';
    return NextResponse.json({ error: msg }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true, id: r.id });
}
