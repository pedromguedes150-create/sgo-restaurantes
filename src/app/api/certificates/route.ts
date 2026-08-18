import { NextResponse } from 'next/server';
import { reasonResponse } from '@/lib/api/reason';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { createCertificate } from '@/lib/certificates/save';
import type { CertificateType } from '@prisma/client';

const REASONS: Record<string, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Sem acesso a esta unidade', status: 403 },
  INVALID: { msg: 'Dados inválidos — confira colaborador e datas', status: 400 },
  NO_LINK: { msg: 'Este colaborador não está vinculado a esta unidade', status: 400 },
  DUPLICATE: { msg: 'Já existe um atestado deste colaborador para este mesmo período', status: 409 },
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.unitId || !b?.collaboratorId) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });

  const r = await createCertificate(user, {
    unitId: b.unitId,
    collaboratorId: b.collaboratorId,
    type: (b.type as CertificateType) || undefined,
    issueDate: b.issueDate || undefined,
    startDate: b.startDate,
    endDate: b.endDate,
    hours: b.hours != null ? Number(b.hours) : undefined,
    doctorName: b.doctorName || undefined,
    doctorCrm: b.doctorCrm || undefined,
    cid: b.cid || undefined,
    cidDescription: b.cidDescription || undefined,
    observation: b.observation || undefined,
    attachmentPath: b.attachmentPath || undefined,
    aiExtracted: b.aiExtracted ?? undefined,
  }, requestContext(req));

  if (!r.ok) return reasonResponse(REASONS, r.reason);
  return NextResponse.json({ ok: true, id: r.id, days: r.days });
}
