import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { updateNote, deleteNote } from '@/lib/notes/create';

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  const r = await updateNote(user, params.id, {
    supplierName: b.supplierName,
    supplierCnpj: b.supplierCnpj,
    number: b.number,
    issueDate: b.issueDate,
    dueDate: b.dueDate,
    totalValue: b.totalValue != null ? Number(b.totalValue) : undefined,
    productType: b.productType,
    observation: b.observation,
  }, requestContext(req));

  if (!r.ok) {
    const map: Record<string, number> = { NOT_FOUND: 404, FORBIDDEN: 403, INVALID: 400 };
    return NextResponse.json({ error: r.reason === 'FORBIDDEN' ? 'Sem acesso' : r.reason === 'NOT_FOUND' ? 'Nota não encontrada' : 'Dados inválidos' }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const r = await deleteNote(user, params.id, requestContext(req));
  if (!r.ok) {
    const map: Record<string, number> = { NOT_FOUND: 404, FORBIDDEN: 403, INVALID: 400 };
    return NextResponse.json({ error: r.reason === 'FORBIDDEN' ? 'Apenas supervisor/admin podem excluir' : r.reason === 'NOT_FOUND' ? 'Nota não encontrada' : 'Falha' }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true });
}
