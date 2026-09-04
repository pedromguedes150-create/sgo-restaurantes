import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { saveCancellationAnalysis } from '@/lib/cancellations/fraud-analysis';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Upload do PDF "Vendas/Itens Cancelados" (Teknisa) → análise antifraude (item 5). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const form = await req.formData().catch(() => null);
  const unitId = String(form?.get('unitId') ?? '');
  const file = form?.get('file');
  if (!unitId) return NextResponse.json({ error: 'Informe a unidade' }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Envie o PDF do relatório' }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  const r = await saveCancellationAnalysis(user, unitId, buffer, file.name, requestContext(req));
  if (!r.ok) return NextResponse.json({ error: r.reason === 'FORBIDDEN' ? 'Sem permissão' : 'Não consegui ler o PDF (confira o relatório do Teknisa)' }, { status: r.reason === 'FORBIDDEN' ? 403 : 400 });
  return NextResponse.json({ ok: true, id: r.id, flags: r.flags });
}
