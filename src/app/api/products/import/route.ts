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
  /* A planilha do fornecedor não fala de Fábrica ou CD — quem importa escolhe.
     Sem isso, o catálogo inteiro poderia cair no lado errado em silêncio. */
  const origemPedida = String(form?.get('origin') ?? '').toUpperCase();
  const defaultOrigin = origemPedida === 'CD' ? 'CD' : 'FABRICA';

  const r = await importProductsXlsx(user, buffer, defaultOrigin);
  if (!r.ok) {
    const msg = r.reason === 'FORBIDDEN' ? 'Sem permissão'
      : r.reason === 'EMPTY' ? 'A planilha foi lida, mas nenhuma linha tinha nome de produto. Confira se a primeira coluna traz os nomes.'
      : 'Não consegui ler a planilha';
    return NextResponse.json({ error: msg, reason: r.reason }, { status: r.reason === 'FORBIDDEN' ? 403 : 400 });
  }
  return NextResponse.json({
    ok: true, created: r.created, updated: r.updated, ignored: r.ignored,
    categoryFromHeader: r.categoryFromHeader, hadOriginColumn: r.hadOriginColumn,
  });
}
