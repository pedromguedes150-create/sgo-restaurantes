import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { createNote } from '@/lib/notes/create';
import type { NoteSource } from '@prisma/client';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.unitId) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  const result = await createNote(
    user,
    {
      unitId: b.unitId,
      source: b.source as NoteSource,
      accessKey: b.accessKey,
      supplierName: b.supplierName,
      supplierCnpj: b.supplierCnpj,
      number: b.number,
      issueDate: b.issueDate,
      dueDate: b.dueDate,
      totalValue: Number(b.totalValue),
      productType: b.productType,
      observation: b.observation,
    },
    requestContext(req),
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.reason === 'FORBIDDEN' ? 'Sem acesso a esta unidade' : 'Preencha fornecedor e valor' }, { status: result.reason === 'FORBIDDEN' ? 403 : 400 });
  }
  return NextResponse.json({ ok: true, id: result.id });
}
