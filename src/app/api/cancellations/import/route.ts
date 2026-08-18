import { NextResponse } from 'next/server';
import { reasonResponse } from '@/lib/api/reason';
import * as XLSX from 'xlsx';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { importCancellations, parseCancellationsCsv, parseTeknisaSheet, type ParsedRow } from '@/lib/cancellations/import';

const REASONS: Record<string, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Apenas o Administrador pode importar', status: 403 },
  INVALID: { msg: 'Arquivo inválido ou colunas não reconhecidas (precisa de nº do cupom e valor)', status: 400 },
  EMPTY: { msg: 'Nenhum cancelamento encontrado no arquivo', status: 400 },
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Envie um arquivo (CSV ou Excel)' }, { status: 400 });

  const unitId = String(form.get('unitId') ?? '');
  const operationalDate = (form.get('operationalDate') as string) || undefined;
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 });
  }

  // Excel (Teknisa) ou CSV genérico
  const name = (file.name || '').toLowerCase();
  const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls');
  let parsed: { rows: ParsedRow[]; mapped: boolean };
  try {
    if (isExcel) {
      const buf = Buffer.from(await file.arrayBuffer());
      const wb = XLSX.read(buf, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
      parsed = parseTeknisaSheet(matrix);
    } else {
      parsed = parseCancellationsCsv(await file.text());
    }
  } catch {
    return NextResponse.json({ error: 'Não foi possível ler o arquivo' }, { status: 422 });
  }
  if (!parsed.mapped) return NextResponse.json({ error: REASONS.INVALID.msg, reason: 'INVALID' }, { status: 400 });

  const result = await importCancellations(user, { unitId, operationalDate, fileName: file.name, rows: parsed.rows }, requestContext(req));
  if (!result.ok) {
    return reasonResponse(REASONS, result.reason);
  }
  return NextResponse.json({ ok: true, created: result.created, operationalDate: result.operationalDate });
}
