import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { computeFreelancerAmount, DAY_TYPE_LABEL } from '@/lib/freelancer/pricing';

/** Prévia do valor do freelancer (horas × valor/hora do dia + vale transporte). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  const b = await req.json().catch(() => null);
  if (!b?.unitId || !canAccessUnit(user, b.unitId)) return NextResponse.json({ error: 'Sem acesso' }, { status: 403 });
  if (!b.workDate || !b.start || !b.end) return NextResponse.json({ configured: false });

  const calc = await computeFreelancerAmount({ unitId: b.unitId, dateISO: b.workDate, start: b.start, end: b.end, transport: b.transport != null ? Number(b.transport) : 0 });
  return NextResponse.json({ ...calc, dayTypeLabel: DAY_TYPE_LABEL[calc.dayType] });
}
