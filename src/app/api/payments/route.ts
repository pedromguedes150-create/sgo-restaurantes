import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { createPaymentRequest } from '@/lib/payments/create';
import type { PaymentType } from '@prisma/client';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const b = await req.json().catch(() => null);
  if (!b?.type || !b?.unitId) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  const result = await createPaymentRequest(
    user,
    {
      type: b.type as PaymentType,
      unitId: b.unitId,
      amount: Number(b.amount),
      description: b.description,
      freelancerId: b.freelancerId,
      workDate: b.workDate,
      shift: b.shift,
      hours: b.hours != null ? Number(b.hours) : undefined,
      workStartTime: b.workStartTime,
      workEndTime: b.workEndTime,
      transportValue: b.transportValue != null ? Number(b.transportValue) : undefined,
      collaboratorName: b.collaboratorName,
      reason: b.reason,
      miscTypeId: b.miscTypeId,
      beneficiary: b.beneficiary,
      supplierId: b.supplierId,
    },
    requestContext(req),
  );

  if (!result.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, INVALID: 400 };
    return NextResponse.json({ error: result.reason === 'FORBIDDEN' ? 'Sem acesso a esta unidade' : 'Dados inválidos', reason: result.reason }, { status: map[result.reason] });
  }
  return NextResponse.json({ ok: true, id: result.id });
}
