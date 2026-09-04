import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { canImportGasNotes, validateGasImport, commitGasImport, MAX_ROWS } from '@/lib/notes/gas-import';

function invalid(r: { missingColumns?: string[]; tooMany?: number }) {
  if (r.tooMany != null) return NextResponse.json({ error: `Arquivo com ${r.tooMany} linhas — o limite é ${MAX_ROWS}.` }, { status: 400 });
  return NextResponse.json({ error: `Colunas obrigatórias ausentes: ${r.missingColumns!.join(', ')}`, missingColumns: r.missingColumns }, { status: 400 });
}

/**
 * POST { mode, rows }
 *  - 'dry'    → pré-visualização (não grava): linhas + status/motivo + resumo.
 *  - 'commit' → grava as linhas OK numa transação, com importBatchId, e devolve o resultado.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  if (!canImportGasNotes(user)) return NextResponse.json({ error: 'Apenas Administração/Supervisão pode importar notas' }, { status: 403 });

  const b = await req.json().catch(() => null);
  const rows = Array.isArray(b?.rows) ? (b.rows as Record<string, unknown>[]) : null;
  if (!rows) return NextResponse.json({ error: 'Envie as linhas da planilha (rows).' }, { status: 400 });

  if (b?.mode === 'commit') {
    const r = await commitGasImport(user, rows, requestContext(req));
    if (!r.ok) return invalid(r);
    return NextResponse.json({ ok: true, ...r.result });
  }

  const r = await validateGasImport(user, rows);
  if (!r.ok) return invalid(r);
  return NextResponse.json({ ok: true, rows: r.rows, summary: r.summary });
}
