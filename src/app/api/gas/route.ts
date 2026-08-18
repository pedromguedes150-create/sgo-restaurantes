import { NextResponse } from 'next/server';
import { reasonResponse } from '@/lib/api/reason';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { createGasReceipt, editGasReceipt } from '@/lib/gas/create';

const REASONS: Record<string, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Sem acesso a esta unidade', status: 403 },
  INVALID: { msg: 'Informe quantidade (kg) e valor total válidos', status: 400 },
  NOT_FOUND: { msg: 'Lançamento não encontrado', status: 404 },
  DUPLICATE: { msg: 'Este recebimento já foi lançado.', status: 409 },
};

export async function POST(req: Request) {
  try {
    return await tratar(req);
  } catch (e) {
    /* Rede de segurança: sem isto, qualquer exceção inesperada virava 500 com
       corpo HTML, o `res.json()` do cliente falhava e a tela dizia "Falha" —
       impossível de diagnosticar de longe. Agora sempre sai JSON com mensagem,
       e o motivo real fica no log do servidor. */
    console.error('[api/gas] erro não tratado:', e);
    return NextResponse.json(
      { error: 'Erro inesperado ao salvar o recebimento. A supervisão foi registrada no log — tente novamente e, se repetir, avise o Admin.' },
      { status: 500 },
    );
  }
}

async function tratar(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });

  // Correção de lançamento (Supervisão/Admin) — não interfere na meta
  if (b.action === 'edit') {
    if (!b.id) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
    const e = await editGasReceipt(user, String(b.id), {
      quantityKg: b.quantityKg != null ? Number(b.quantityKg) : undefined,
      totalValue: b.totalValue != null ? Number(b.totalValue) : undefined,
      supplierId: b.supplierId === undefined ? undefined : (b.supplierId || null),
      observation: b.observation === undefined ? undefined : b.observation,
    }, requestContext(req));
    if (!e.ok) return reasonResponse(REASONS, e.reason);
    return NextResponse.json({ ok: true });
  }

  if (!b?.unitId) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });

  const r = await createGasReceipt(user, {
    unitId: b.unitId,
    supplierId: b.supplierId || undefined,
    quantityKg: b.quantityKg != null ? Number(b.quantityKg) : undefined,
    pricePerKg: b.pricePerKg != null ? Number(b.pricePerKg) : undefined,
    totalValue: b.totalValue != null ? Number(b.totalValue) : undefined,
    operationalDate: b.operationalDate || undefined,
    accessKey: b.accessKey || undefined,
    noteNumber: b.noteNumber || undefined,
    dueDate: b.dueDate || undefined,
    observation: b.observation || undefined,
    kind: b.kind === 'CYLINDER' ? 'CYLINDER' : undefined,
    cylinderCount: b.cylinderCount != null ? Number(b.cylinderCount) : undefined,
    cylinderKg: b.cylinderKg != null ? Number(b.cylinderKg) : undefined,
    cylindersReturned: b.cylindersReturned != null ? Number(b.cylindersReturned) : undefined,
  }, requestContext(req));

  if (!r.ok) return reasonResponse(REASONS, r.reason, r.message);
  return NextResponse.json({ ok: true, id: r.id, pricePerKg: r.pricePerKg, variationPct: r.variationPct, alerted: r.alerted });
}
