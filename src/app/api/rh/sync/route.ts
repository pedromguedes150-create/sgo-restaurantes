import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { syncCollaboratorsForUnit } from '@/lib/rh/sync';

const MSG: Record<string, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Apenas o Administrador', status: 403 },
  NOT_CONFIGURED: { msg: 'RH_API_KEY não configurada no .env', status: 400 },
  NO_RH_NAME: { msg: 'Defina o "Nome no RH" desta unidade antes de sincronizar', status: 400 },
  NOT_FOUND: { msg: 'Unidade não encontrada', status: 404 },
  RH_ERROR: { msg: 'Erro ao consultar o RH', status: 502 },
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.unitId) return NextResponse.json({ error: 'unitId obrigatório' }, { status: 400 });

  const r = await syncCollaboratorsForUnit(user, b.unitId);
  if (!r.ok) {
    const m = MSG[r.reason];
    return NextResponse.json({ error: r.message ? `${m.msg}: ${r.message}` : m.msg, reason: r.reason }, { status: m.status });
  }
  return NextResponse.json({ ok: true, created: r.created, updated: r.updated, total: r.total });
}
