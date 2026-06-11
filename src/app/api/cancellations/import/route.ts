import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { importCancellations } from '@/lib/cancellations/import';

const REASONS: Record<string, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Apenas o Administrador pode importar', status: 403 },
  INVALID: { msg: 'Arquivo inválido ou colunas não reconhecidas (precisa de cupom e valor)', status: 400 },
  EMPTY: { msg: 'Nenhum cancelamento encontrado no arquivo', status: 400 },
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Envie um arquivo CSV' }, { status: 400 });

  const unitId = String(form.get('unitId') ?? '');
  const operationalDate = (form.get('operationalDate') as string) || undefined;
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Arquivo CSV não enviado' }, { status: 400 });
  }
  const csv = await file.text();

  const result = await importCancellations(user, { unitId, operationalDate, fileName: file.name, csv }, requestContext(req));
  if (!result.ok) {
    const r = REASONS[result.reason];
    return NextResponse.json({ error: r.msg, reason: result.reason }, { status: r.status });
  }
  return NextResponse.json({ ok: true, created: result.created, operationalDate: result.operationalDate });
}
