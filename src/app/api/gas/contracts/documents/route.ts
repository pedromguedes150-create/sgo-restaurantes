import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { attachContractDocument } from '@/lib/gas/contracts';

/**
 * POST multipart/form-data — anexa documento a um contrato de gás.
 * Campos: contractId (string), file (File PDF ou imagem)
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const form = await req.formData().catch(() => null);
  const contractId = String(form?.get('contractId') ?? '').trim();
  const file = form?.get('file');

  if (!contractId || !(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Informe o contrato e o arquivo.' }, { status: 400 });
  }

  const ctx = requestContext(req);
  const r = await attachContractDocument(user, contractId, file, ctx);

  if (!r.ok) {
    const map: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400 };
    const msg = r.reason === 'FORBIDDEN' ? 'Sem permissão' : r.reason === 'NOT_FOUND' ? 'Contrato não encontrado' : 'Formato de arquivo inválido (PDF ou imagem)';
    return NextResponse.json({ error: msg }, { status: map[r.reason] ?? 400 });
  }

  return NextResponse.json({ ok: true, doc: r.doc });
}
