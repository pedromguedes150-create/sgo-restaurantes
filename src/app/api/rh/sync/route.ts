import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { syncCollaboratorsForUnit, syncAllRegisteredUnits } from '@/lib/rh/sync';

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
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const b = await req.json().catch(() => null);

  if (b?.all) {
    const ra = await syncAllRegisteredUnits(user);
    if (!ra.ok) { const m = MSG[ra.reason]; return NextResponse.json({ error: m.msg, reason: ra.reason }, { status: m.status }); }
    return NextResponse.json({ ok: true, created: ra.created, updated: ra.updated, total: ra.total, units: ra.units });
  }
  if (!b?.unitId) return NextResponse.json({ error: 'unitId obrigatório' }, { status: 400 });

  const r = await syncCollaboratorsForUnit(user, b.unitId);
  if (!r.ok) {
    const m = MSG[r.reason];
    return NextResponse.json({ error: r.message ? `${m.msg}: ${r.message}` : m.msg, reason: r.reason }, { status: m.status });
  }
  return NextResponse.json({ ok: true, created: r.created, updated: r.updated, total: r.total });
}
