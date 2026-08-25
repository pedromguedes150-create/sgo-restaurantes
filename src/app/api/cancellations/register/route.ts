import { NextResponse } from 'next/server';
import { reasonResponse } from '@/lib/api/reason';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { registerCancellation } from '@/lib/cancellations/register';
import { saveAttachment, UploadError } from '@/lib/uploads';

export const dynamic = 'force-dynamic';

const REASONS: Record<string, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Sem acesso a esta unidade', status: 403 },
  NO_PHOTO: { msg: 'A foto do cupom é obrigatória', status: 422 },
  DUPLICATE: { msg: 'Este cupom já foi registrado hoje nesta unidade', status: 409 },
  INVALID: { msg: 'Dados inválidos', status: 400 },
};

/**
 * POST multipart — registro do cancelamento com a foto do cupom.
 *
 * Multipart e não JSON porque a foto vem da câmera do celular junto do
 * formulário; mandar em base64 dentro de um JSON dobraria o tamanho de um
 * arquivo que já passa de 5MB.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  const unitId = String(form.get('unitId') ?? '');
  const photo = form.get('photo');
  if (!unitId) return NextResponse.json({ error: 'Unidade não informada' }, { status: 400 });
  if (!(photo instanceof File) || photo.size === 0) {
    return NextResponse.json({ error: REASONS.NO_PHOTO.msg }, { status: 422 });
  }

  /* A foto é salva ANTES do registro porque o registro precisa do caminho. Se a
     regra recusar depois (cupom duplicado, valor inválido), fica um arquivo
     órfão no volume — preço menor do que perder a foto de um cupom que já foi
     para o lixo. */
  let photoPath: string;
  try {
    const saved = await saveAttachment(photo, unitId, `canc-${Date.now()}`);
    photoPath = saved.path;
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }

  const r = await registerCancellation(
    user,
    {
      unitId,
      couponNumber: String(form.get('couponNumber') ?? ''),
      value: Number(String(form.get('value') ?? '0').replace('.', '').replace(',', '.')),
      canceledAt: form.get('canceledAt') ? String(form.get('canceledAt')) : undefined,
      cashOperator: form.get('cashOperator') ? String(form.get('cashOperator')) : undefined,
      reasonId: form.get('reasonId') ? String(form.get('reasonId')) : undefined,
      note: form.get('note') ? String(form.get('note')) : undefined,
      photoPath,
    },
    requestContext(req),
  );

  if (!r.ok) return reasonResponse(REASONS, r.reason);
  return NextResponse.json({ ok: true, id: r.id, juntouAoImportado: r.juntouAoImportado });
}
