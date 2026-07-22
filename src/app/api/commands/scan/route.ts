import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { getScanContext, submitScanCount } from '@/lib/commands/scan';

export const dynamic = 'force-dynamic';

const REASONS: Record<string, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Sem acesso a esta unidade', status: 403 },
  NO_CONFIG: { msg: 'Sequência de comandas não configurada para esta unidade', status: 400 },
  OBSERVATION_REQUIRED: { msg: 'Observação obrigatória', status: 422 },
  INVALID: { msg: 'Dados inválidos', status: 400 },
};

/** GET ?unitId= — contexto da conferência (sequência ativa do dia). */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const unitId = new URL(req.url).searchParams.get('unitId') ?? '';
  if (!unitId) return NextResponse.json({ error: 'Unidade não informada' }, { status: 400 });

  const r = await getScanContext(user, unitId);
  if (!r.ok) {
    const x = REASONS[r.reason];
    return NextResponse.json({ error: x.msg, reason: r.reason }, { status: x.status });
  }
  return NextResponse.json(r.ctx);
}

/** POST { unitId, scannedNumbers[], note? } — fecha a conferência do dia. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.unitId || !Array.isArray(b.scannedNumbers)) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  const r = await submitScanCount(
    user,
    { unitId: String(b.unitId), scannedNumbers: b.scannedNumbers.map(Number), note: b.note ? String(b.note) : undefined },
    requestContext(req),
  );
  if (!r.ok) {
    const x = REASONS[r.reason];
    return NextResponse.json({ error: x.msg, reason: r.reason }, { status: x.status });
  }
  return NextResponse.json(r);
}
