import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { reasonResponse } from '@/lib/api/reason';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { createOccurrence } from '@/lib/occurrences/create';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { saveAttachment, UploadError } from '@/lib/uploads';
import type { OccurrenceGravity } from '@prisma/client';

const REASONS: Record<string, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Sem acesso a esta unidade', status: 403 },
  INVALID: { msg: 'Dados inválidos (tipo, categoria, gravidade e descrição são obrigatórios)', status: 400 },
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  let unitId = '';
  let typeId = '';
  let categoryId = '';
  let gravity = '' as OccurrenceGravity;
  let description = '';
  let customerName: string | undefined;
  const attachments: { path: string; mimeType: string }[] = [];

  const contentType = req.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      unitId = String(form.get('unitId') ?? '');
      typeId = String(form.get('typeId') ?? '');
      categoryId = String(form.get('categoryId') ?? '');
      gravity = String(form.get('gravity') ?? '') as OccurrenceGravity;
      description = String(form.get('description') ?? '');
      customerName = (form.get('customerName') as string) || undefined;

      if (!unitId || !canAccessUnit(user, unitId)) {
        return NextResponse.json({ error: 'Sem acesso a esta unidade' }, { status: 403 });
      }
      const files = form.getAll('attachments').filter((f): f is File => f instanceof File && f.size > 0);
      for (const f of files) {
        attachments.push(await saveAttachment(f, unitId, `occ-${Date.now()}`));
      }
    } else {
      const body = await req.json();
      unitId = body.unitId;
      typeId = body.typeId;
      categoryId = body.categoryId;
      gravity = body.gravity;
      description = body.description;
      customerName = body.customerName;
    }
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 422 });
    return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  }

  const result = await createOccurrence(
    user,
    { unitId, typeId, categoryId, gravity, description, customerName, attachments },
    requestContext(req),
  );

  if (!result.ok) {
    return reasonResponse(REASONS, result.reason);
  }

  return NextResponse.json({
    ok: true,
    id: result.id,
    number: result.number,
    isRecurrence: result.isRecurrence,
    gravity: result.gravity,
  });
}
