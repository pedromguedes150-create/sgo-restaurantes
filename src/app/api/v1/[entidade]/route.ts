import { NextResponse } from 'next/server';
import { comApiKey } from '@/lib/api-global/guarda';
import { porSlug } from '@/lib/api-global/registro';
import { lerFiltro, listar } from '@/lib/api-global/dados';

export const dynamic = 'force-dynamic';

/** GET /api/v1/<entidade>?from=&to=&page=&limit= — lista paginada com o total (v1.167.0). */
export const GET = comApiKey(async (req) => {
  const url = new URL(req.url);
  const slug = url.pathname.split('/').filter(Boolean)[2] ?? '';
  const e = porSlug.get(slug);
  if (!e) return NextResponse.json({ error: 'Entidade desconhecida', detail: `Consulte GET /api/v1 para o catálogo. Recebido: "${slug}".` }, { status: 404 });
  return NextResponse.json(await listar(e, lerFiltro(url)));
});
