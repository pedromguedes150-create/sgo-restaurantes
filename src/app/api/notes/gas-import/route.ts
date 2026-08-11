import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { canImportGasNotes, validateGasImport, MAX_ROWS } from '@/lib/notes/gas-import';

/**
 * POST { mode: 'dry', rows } — pré-visualização (dry-run) do import em lote de gás.
 * Não grava nada. A gravação transacional entra na etapa seguinte (mode: 'commit').
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!canImportGasNotes(user)) return NextResponse.json({ error: 'Apenas Administração/Supervisão pode importar notas' }, { status: 403 });

  const b = await req.json().catch(() => null);
  const rows = Array.isArray(b?.rows) ? (b.rows as Record<string, unknown>[]) : null;
  if (!rows) return NextResponse.json({ error: 'Envie as linhas da planilha (rows).' }, { status: 400 });

  const mode = b?.mode === 'commit' ? 'commit' : 'dry';
  if (mode !== 'dry') return NextResponse.json({ error: 'Gravação ainda não disponível (próxima etapa).' }, { status: 400 });

  const r = await validateGasImport(user, rows);
  if (!r.ok) {
    if ('tooMany' in r) return NextResponse.json({ error: `Arquivo com ${r.tooMany} linhas — o limite é ${MAX_ROWS}.` }, { status: 400 });
    return NextResponse.json({ error: `Colunas obrigatórias ausentes: ${r.missingColumns.join(', ')}`, missingColumns: r.missingColumns }, { status: 400 });
  }
  return NextResponse.json({ ok: true, rows: r.rows, summary: r.summary });
}
