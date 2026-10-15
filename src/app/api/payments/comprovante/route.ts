import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { recusaSeAbaFechada } from '@/lib/permissions/guarda-abas';
import { getSessionUser } from '@/lib/auth/session';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { saveAttachment, UploadError } from '@/lib/uploads';

/**
 * Comprovante do REEMBOLSO (v1.169.0): foto ou PDF da passagem/despesa. Grava
 * no volume da unidade e devolve o caminho; a solicitação é criada depois com
 * `attachmentPath`, e a lib só aceita caminho do volume da própria unidade.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negadoRota = await guardaDaRota(user.role, req);
  if (negadoRota) return negadoRota;
  const negado = await recusaSeAbaFechada(user.role, 'PAYMENTS_TAB_NEW');
  if (negado) return negado;

  const form = await req.formData().catch(() => null);
  const unitId = String(form?.get('unitId') ?? '');
  const file = form?.get('comprovante');
  if (!unitId || !canAccessUnit(user, unitId)) return NextResponse.json({ error: 'Sem acesso a esta unidade' }, { status: 403 });
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Envie a foto ou o PDF do comprovante' }, { status: 400 });

  try {
    const saved = await saveAttachment(file, unitId, `reembolso-${Date.now()}`);
    return NextResponse.json({ ok: true, attachmentPath: saved.path });
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
