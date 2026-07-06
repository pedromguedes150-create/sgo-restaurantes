import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import * as ma from '@/lib/manager-area';
import type { ManagerLeaveKind } from '@prisma/client';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.entity || !b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });

  let r: { ok: boolean; reason?: string; id?: string } | undefined;
  const e = b.entity as string, a = b.action as string;

  if (e === 'task' && a === 'create') r = await ma.createManagerTask(user, { title: b.title, notes: b.notes, dueAt: b.dueAt });
  else if (e === 'task' && a === 'update') r = await ma.updateManagerTask(user, b.id, { title: b.title, notes: b.notes, dueAt: b.dueAt });
  else if (e === 'task' && a === 'toggle') r = await ma.toggleManagerTask(user, b.id, Boolean(b.done));
  else if (e === 'task' && a === 'delete') r = await ma.deleteManagerTask(user, b.id);
  else if (e === 'note' && a === 'add') r = await ma.addManagerNote(user, { title: b.title, content: b.content });
  else if (e === 'note' && a === 'update') r = await ma.updateManagerNote(user, b.id, { title: b.title, content: b.content });
  else if (e === 'note' && a === 'delete') r = await ma.deleteManagerNote(user, b.id);
  else if (e === 'leave' && a === 'add') r = await ma.addManagerLeave(user, { kind: b.kind as ManagerLeaveKind, startDate: b.startDate, endDate: b.endDate, note: b.note });
  else if (e === 'leave' && a === 'delete') r = await ma.deleteManagerLeave(user, b.id);

  if (!r) return NextResponse.json({ error: 'Operação desconhecida' }, { status: 400 });
  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, INVALID: 400 };
    return NextResponse.json({ error: r.reason === 'FORBIDDEN' ? 'Sem permissão' : 'Dados inválidos', reason: r.reason }, { status: map[r.reason ?? 'INVALID'] ?? 400 });
  }
  return NextResponse.json({ ok: true, id: r.id });
}
