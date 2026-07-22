import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { importProductsXlsx } from '@/lib/products';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Envie o arquivo (.xlsx)' }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  const r = await importProductsXlsx(user, buffer);
  if (!r.ok) return NextResponse.json({ error: r.reason === 'FORBIDDEN' ? 'Sem permissão' : 'Não consegui ler a planilha' }, { status: r.reason === 'FORBIDDEN' ? 403 : 400 });
  return NextResponse.json({ ok: true, created: r.created, updated: r.updated });
}
