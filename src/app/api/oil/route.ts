import { NextResponse } from 'next/server';
import { recusaSeAbaFechada } from '@/lib/permissions/guarda-abas';
import { reasonResponse } from '@/lib/api/reason';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { removeUpload, saveEvidence, UploadError } from '@/lib/uploads';
import { createOilCollection } from '@/lib/oil/create';

const REASONS: Record<string, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Sem acesso a esta unidade', status: 403 },
  INVALID: { msg: 'Informe litros e valor por litro válidos', status: 400 },
  SEM_COMPROVANTE: { msg: 'Anexe a foto do recibo da coleta', status: 422 },
  SEM_COLETOR: { msg: 'Informe a empresa ou o responsável pela coleta', status: 422 },
  DATA_FUTURA: { msg: 'A data da coleta não pode estar no futuro', status: 400 },
};

/**
 * Lançamento da coleta de óleo. Chega como `multipart/form-data` porque a foto
 * do recibo vai junto: sem ela `createOilCollection` recusa.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  /* Aba fechada na matriz de perfis não grava. */
  const negado = await recusaSeAbaFechada(user.role, 'OIL_TAB_NEW');
  if (negado) return negado;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });

  const unitId = String(form.get('unitId') ?? '');
  if (!unitId) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  /* O escopo é conferido ANTES de escrever o arquivo: gravar a foto para
     depois recusar o lançamento deixaria lixo no volume em nome de quem nem
     enxerga a unidade. */
  if (!canAccessUnit(user, unitId)) return NextResponse.json({ error: 'Sem acesso a esta unidade' }, { status: 403 });

  const operationalDate = String(form.get('operationalDate') ?? '') || undefined;
  const recibo = form.get('receipt');
  if (!(recibo instanceof File) || recibo.size === 0) return reasonResponse(REASONS, 'SEM_COMPROVANTE');

  let receiptPath: string;
  try {
    receiptPath = await saveEvidence(recibo, unitId, `oil-${operationalDate ?? 'hoje'}-${Date.now()}`);
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }

  const num = (k: string) => { const v = form.get(k); return v == null || v === '' ? undefined : Number(v); };
  const txt = (k: string) => { const v = form.get(k); return v ? String(v) : undefined; };

  const r = await createOilCollection(user, {
    unitId,
    supplierId: txt('supplierId'),
    liters: Number(form.get('liters')),
    pricePerLiter: Number(form.get('pricePerLiter')),
    totalValue: num('totalValue'),
    paymentMethod: txt('paymentMethod'),
    collectorName: txt('collectorName'),
    observation: txt('observation'),
    operationalDate,
    receiptPath,
  }, requestContext(req));

  if (!r.ok) {
    /* A foto é gravada antes de a regra decidir (sem ela, `createOilCollection`
       nem chega a avaliar o resto). Quando o lançamento é recusado — data
       futura, litros inválidos —, o arquivo já está em disco e não pertence a
       registro nenhum: tentativa recusada não deixa rastro no volume. */
    await removeUpload(receiptPath);
    return reasonResponse(REASONS, r.reason);
  }
  return NextResponse.json({ ok: true, id: r.id, totalValue: r.totalValue });
}
