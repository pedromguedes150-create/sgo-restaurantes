import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { saveAttachment, UploadError } from '@/lib/uploads';
import { readMedicalCertificate } from '@/lib/ai/atestado';

/**
 * Recebe a foto do atestado: salva o anexo e tenta ler os campos por IA.
 * Retorna { attachmentPath, ai } — a tela pré-preenche o formulário e destaca
 * os campos de baixa confiança. PDF é aceito como anexo, mas não passa pela IA.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) return NextResponse.json({ error: 'Envie a imagem do atestado' }, { status: 400 });

  try {
    const form = await req.formData();
    const unitId = String(form.get('unitId') ?? '');
    if (!unitId || !canAccessUnit(user, unitId)) return NextResponse.json({ error: 'Sem acesso a esta unidade' }, { status: 403 });
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Arquivo inválido' }, { status: 400 });

    const saved = await saveAttachment(file, unitId, `cert-${user.id}`);

    let ai = null as Awaited<ReturnType<typeof readMedicalCertificate>> | null;
    if (saved.mimeType.startsWith('image/')) {
      const buf = Buffer.from(await file.arrayBuffer());
      ai = await readMedicalCertificate({ photoBase64: buf.toString('base64'), mediaType: saved.mimeType });
    }
    return NextResponse.json({ ok: true, attachmentPath: saved.path, mimeType: saved.mimeType, ai });
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 422 });
    return NextResponse.json({ error: 'Falha ao processar o arquivo' }, { status: 400 });
  }
}
