import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { reasonResponse } from '@/lib/api/reason';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { registerItemCancellation } from '@/lib/cancellations/items';
import { saveAttachment, UploadError } from '@/lib/uploads';

export const dynamic = 'force-dynamic';

const REASONS: Record<string, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Sem acesso a esta unidade', status: 403 },
  PHOTO_REQUIRED: { msg: 'O produto já saiu da cozinha — a foto dele de volta é obrigatória', status: 422 },
  INVALID: { msg: 'Dados inválidos', status: 400 },
};

/** POST multipart — cancelamento de item, com foto quando o produto já saiu. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  const unitId = String(form.get('unitId') ?? '');
  if (!unitId) return NextResponse.json({ error: 'Unidade não informada' }, { status: 400 });

  const delivered = String(form.get('delivered') ?? '') === 'true';
  const photo = form.get('photo');

  /* A foto só é salva quando existe. A regra decide se ela era obrigatória —
     aqui não se duplica a decisão, senão as duas podem discordar. */
  let photoPath: string | undefined;
  if (photo instanceof File && photo.size > 0) {
    try {
      const saved = await saveAttachment(photo, unitId, `item-${Date.now()}`);
      photoPath = saved.path;
    } catch (e) {
      if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 422 });
      throw e;
    }
  }

  const num = (k: string) => Number(String(form.get(k) ?? '0').replace('.', '').replace(',', '.'));

  const r = await registerItemCancellation(
    user,
    {
      unitId,
      productName: String(form.get('productName') ?? ''),
      quantity: num('quantity'),
      value: num('value'),
      delivered,
      canceledAt: form.get('canceledAt') ? String(form.get('canceledAt')) : undefined,
      tableLabel: form.get('tableLabel') ? String(form.get('tableLabel')) : undefined,
      waiterName: form.get('waiterName') ? String(form.get('waiterName')) : undefined,
      reasonId: form.get('reasonId') ? String(form.get('reasonId')) : undefined,
      note: form.get('note') ? String(form.get('note')) : undefined,
      photoPath,
    },
    requestContext(req),
  );

  if (!r.ok) return reasonResponse(REASONS, r.reason);
  return NextResponse.json({ ok: true, id: r.id });
}
