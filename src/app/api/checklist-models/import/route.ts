import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { importModelRows } from '@/lib/checklist-models';

/** Importa modelos de uma planilha (.xlsx/.csv) — UPSERT por nome. Admin. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Restrito ao Administrador' }, { status: 403 });

  let rows: Record<string, unknown>[] = [];
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Envie a planilha (.xlsx ou .csv)' }, { status: 400 });
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return NextResponse.json({ error: 'Planilha vazia' }, { status: 400 });
    rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[];
  } catch {
    return NextResponse.json({ error: 'Não foi possível ler a planilha. Use o modelo exportado (.xlsx ou .csv).' }, { status: 422 });
  }

  const r = await importModelRows(user, rows, requestContext(req));
  if (!r.ok) {
    return NextResponse.json({ error: r.reason === 'FORBIDDEN' ? 'Sem permissão' : 'Planilha sem a coluna "Modelo" ou sem linhas válidas' }, { status: r.reason === 'FORBIDDEN' ? 403 : 400 });
  }
  return NextResponse.json({ ok: true, created: r.created, updated: r.updated });
}
