import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { registerAbsence } from '@/lib/schedule';
import { saveAttachment, UploadError } from '@/lib/uploads';
import type { DayStatus } from '@prisma/client';

/** Registrar ausência (FI/FJ/A/FE) num período, com anexo opcional (atestado). multipart. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });

  const unitId = String(form.get('unitId') ?? '');
  const collaboratorId = String(form.get('collaboratorId') ?? '');
  const status = String(form.get('status') ?? '') as DayStatus;
  const start = String(form.get('start') ?? '');
  const end = String(form.get('end') ?? '');
  const reason = (form.get('reason') as string) || undefined;
  const note = (form.get('note') as string) || undefined;
  const file = form.get('attachment');

  let attachmentPath: string | undefined;
  if (file && file instanceof File && file.size > 0) {
    try {
      const saved = await saveAttachment(file, unitId, `atestado-${collaboratorId}`);
      attachmentPath = saved.path;
    } catch (e) {
      return NextResponse.json({ error: e instanceof UploadError ? e.message : 'Falha no anexo' }, { status: 400 });
    }
  }

  const ctx = requestContext(req);
  const r = await registerAbsence(user, { collaboratorId, unitId, status, start, end, reason, note, attachmentPath }, ctx);
  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, INVALID: 400, NOT_FOUND: 404 };
    return NextResponse.json({ error: r.reason === 'FORBIDDEN' ? 'Sem permissão' : 'Dados inválidos', reason: r.reason }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true });
}
