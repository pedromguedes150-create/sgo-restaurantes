import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { criarVaga } from '@/lib/vagas/acoes';
import { lerCorpo } from '@/lib/vagas/formulario-http';

export const dynamic = 'force-dynamic';

/** Nova solicitação de vaga (multipart: `dados` + currículos opcionais). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const corpo = await lerCorpo(req);
  if (!corpo) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  try {
    const r = await criarVaga(user, corpo.dados, corpo.arquivos, requestContext(req));
    if (!r.ok) return NextResponse.json({ error: r.error, erros: r.erros }, { status: r.status });
    return NextResponse.json({ ok: true, id: r.id, codigo: r.codigo });
  } catch (e) {
    console.error('[vagas] falha ao criar:', e);
    return NextResponse.json({ error: 'Não foi possível enviar a solicitação. Tente de novo.' }, { status: 500 });
  }
}
