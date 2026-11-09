import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { saveAttachment, UploadError } from '@/lib/uploads';
import { lerDocumentoRh, MIDIAS_ACEITAS } from '@/lib/ai/atestado';

/**
 * Recebe a foto ou o PDF do documento: salva o anexo e lê por IA (campos +
 * nomenclatura do catálogo + confiança/evidência por campo). Retorna
 * { attachmentPath, ai } — a tela monta a conferência e destaca o que ficou
 * com baixa confiança. v1.196.0: PDF também passa pela IA.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) return NextResponse.json({ error: 'Envie a foto ou o PDF do documento' }, { status: 400 });

  try {
    const form = await req.formData();
    const unitId = String(form.get('unitId') ?? '');
    if (!unitId || !canAccessUnit(user, unitId)) return NextResponse.json({ error: 'Sem acesso a esta unidade' }, { status: 403 });
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Arquivo inválido' }, { status: 400 });

    const saved = await saveAttachment(file, unitId, `cert-${user.id}`);

    let ai = null as Awaited<ReturnType<typeof lerDocumentoRh>> | null;
    if (MIDIAS_ACEITAS.includes(saved.mimeType)) {
      const buf = Buffer.from(await file.arrayBuffer());
      ai = await lerDocumentoRh({ base64: buf.toString('base64'), mediaType: saved.mimeType });
    }
    return NextResponse.json({ ok: true, attachmentPath: saved.path, mimeType: saved.mimeType, ai });
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 422 });
    return NextResponse.json({ error: 'Falha ao processar o arquivo' }, { status: 400 });
  }
}
