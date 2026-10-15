import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { recusaSeAbaFechada } from '@/lib/permissions/guarda-abas';
import { getSessionUser } from '@/lib/auth/session';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { saveAttachment, UploadError } from '@/lib/uploads';

/**
 * Carta de pedido de demissão (v1.168.0): o RH exige a carta em `pedido_demissao`.
 * Guarda o PDF no volume e devolve o caminho; o pedido grava `letterPath` e a
 * fila de saída lê o arquivo na hora de enviar (base64).
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negadoRota = await guardaDaRota(user.role, req);
  if (negadoRota) return negadoRota;
  const negado = await recusaSeAbaFechada(user.role, 'TERMINATIONS_TAB_NEW');
  if (negado) return negado;

  const form = await req.formData().catch(() => null);
  const unitId = String(form?.get('unitId') ?? '');
  const file = form?.get('carta');
  if (!unitId || !canAccessUnit(user, unitId)) return NextResponse.json({ error: 'Sem acesso a esta unidade' }, { status: 403 });
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Envie a carta em PDF' }, { status: 400 });
  const ext = (file.name?.split('.').pop() ?? '').toLowerCase();
  if (file.type !== 'application/pdf' && ext !== 'pdf') return NextResponse.json({ error: 'A carta precisa ser um PDF' }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'A carta passa de 10 MB (limite do RH)' }, { status: 400 });

  try {
    const saved = await saveAttachment(file, unitId, `carta-${Date.now()}`);
    return NextResponse.json({ ok: true, letterPath: saved.path });
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
