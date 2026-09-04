import { NextResponse } from 'next/server';
import { recusaDeAba } from '@/lib/permissions/guarda-abas';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { sendChangeRequest, confirmChangeReceipt, suggestChangeRequest, countVault, refillBucket, officeSwap, vaultWithdrawal, upsertBucket, toggleBucket, deleteBucket, registerChange, requestChange, resolveChangeRequest } from '@/lib/cash-vault';

/** POST { action, … } — Cofre de troco v2 (16/07). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  /* Aba fechada na matriz de perfis não grava — esconder o botão é
     conveniência, recusar aqui é o controle. */
  const negado = b?.action ? await recusaDeAba(user.role, 'CASH', String(b.action)) : null;
  if (negado) return negado;
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  let r;
  if (b.action === 'count') r = await countVault(user, String(b.unitId ?? ''), b.balances ?? {}, b.note, ctx);
  else if (b.action === 'refill') r = await refillBucket(user, String(b.unitId ?? ''), String(b.bucketId ?? ''), b.outSmall ?? {}, b.inBig ?? {}, b.note, ctx);
  else if (b.action === 'officeSwap') r = await officeSwap(user, String(b.unitId ?? ''), b.outBig ?? {}, b.inSmall ?? {}, b.note, ctx);
  else if (b.action === 'withdrawal') r = await vaultWithdrawal(user, String(b.unitId ?? ''), b.amounts ?? {}, String(b.reason ?? ''), ctx);
  else if (b.action === 'bucketSet') r = await upsertBucket(user, { id: b.id ? String(b.id) : undefined, unitId: String(b.unitId ?? ''), name: String(b.name ?? ''), targetValue: Number(b.targetValue) }, ctx);
  else if (b.action === 'bucketToggle') r = await toggleBucket(user, String(b.id ?? ''), Boolean(b.active), ctx);
  else if (b.action === 'bucketDelete') r = await deleteBucket(user, String(b.id ?? ''), ctx);
  else if (b.action === 'registerChange') r = await registerChange(user, String(b.unitId ?? ''), String(b.registerName ?? ''), b.outFromVault ?? {}, b.inToVault ?? {}, b.note, ctx);
  else if (b.action === 'suggestChange') {
    /* Só devolve a sugestão — não grava nada. Quem decide é o gerente, que
       ajusta na tela antes de enviar. */
    const sug = await suggestChangeRequest(user, String(b.unitId ?? ''));
    return NextResponse.json(sug ?? { vazia: true, motivo: 'Sem acesso a esta unidade.' });
  }
  else if (b.action === 'requestChange') r = await requestChange(user, String(b.unitId ?? ''), { note: b.note != null ? String(b.note) : undefined, need: b.need ?? {}, give: b.give ?? {} }, ctx);
  else if (b.action === 'sendChange') r = await sendChangeRequest(user, String(b.id ?? ''), { sent: b.sent, note: b.note }, ctx);
  else if (b.action === 'confirmReceipt') r = await confirmChangeReceipt(user, String(b.id ?? ''), { received: b.received, note: b.note }, ctx);
  else if (b.action === 'resolveChange') r = await resolveChangeRequest(user, String(b.id ?? ''), b.cancel ? 'cancel' : 'resolve', b.resolvedNote, ctx);
  else return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });

  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400 };
    const fallback = r.reason === 'FORBIDDEN' ? 'Sem permissão' : r.reason === 'NOT_FOUND' ? 'Registro não encontrado' : 'Dados inválidos';
    return NextResponse.json({ error: ('detail' in r && r.detail) || fallback }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true });
}
