import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { saveOpenCommandAnalysis } from '@/lib/commands/open-analysis';

/** Upload do relatório "Comandas em Aberto" (Teknisa) → análise antifraude (20/07). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const unitId = String(form.get('unitId') ?? '');
  const cutDate = String(form.get('cutDate') ?? '');
  const file = form.get('file');
  if (!unitId || !/^\d{4}-\d{2}-\d{2}$/.test(cutDate)) return NextResponse.json({ error: 'Informe unidade e data de corte' }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Envie o arquivo do relatório (.xlsx/.csv)' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const r = await saveOpenCommandAnalysis(user, unitId, buffer, file.name, cutDate, requestContext(req));
  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, INVALID: 400 };
    return NextResponse.json({ error: r.reason === 'FORBIDDEN' ? 'Sem permissão' : 'Não consegui ler o relatório (confira o arquivo do Teknisa)' }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true, id: r.id, suspectCount: r.suspectCount });
}
