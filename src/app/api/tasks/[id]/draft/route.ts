import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import type { Prisma } from '@prisma/client';

/** Auto-salvamento do preenchimento (rascunho) — contra interrupções. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const inst = await prisma.taskInstance.findUnique({ where: { id: params.id }, select: { unitId: true, status: true } });
  if (!inst) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  if (!canAccessUnit(user, inst.unitId)) return NextResponse.json({ error: 'Sem acesso' }, { status: 403 });
  if (inst.status !== 'PENDING' && inst.status !== 'MISSED') return NextResponse.json({ ok: true }); // já concluído

  const body = await req.json().catch(() => null);
  await prisma.taskInstance.update({ where: { id: params.id }, data: { draft: (body?.draft ?? {}) as Prisma.InputJsonValue } });
  return NextResponse.json({ ok: true });
}
