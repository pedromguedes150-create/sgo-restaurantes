import { NextResponse } from 'next/server';
import { reasonResponse } from '@/lib/api/reason';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { confirmCommunication } from '@/lib/communications/confirm';
import { saveAttachment, UploadError } from '@/lib/uploads';

const REASONS: Record<string, { msg: string; status: number }> = {
  NOT_FOUND: { msg: 'Comunicado não encontrado para você', status: 404 },
  ALREADY: { msg: 'Você já confirmou este comunicado', status: 409 },
  RESPONSE_REQUIRED: { msg: 'Este comunicado exige uma resposta (foto ou comentário)', status: 400 },
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  let responseNote: string | undefined;
  let responsePath: string | undefined;
  const contentType = req.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      responseNote = (form.get('responseNote') as string) || undefined;
      const file = form.get('responsePhoto');
      if (file instanceof File && file.size > 0) {
        const saved = await saveAttachment(file, 'comm', `resp-${params.id}-${user.id}`);
        responsePath = saved.path;
      }
    } else {
      const b = await req.json().catch(() => ({}));
      responseNote = b.responseNote;
    }
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 422 });
    return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  }

  const r = await confirmCommunication(user, params.id, { responseNote, responsePath }, requestContext(req));
  if (!r.ok) {
    return reasonResponse(REASONS, r.reason);
  }
  return NextResponse.json({ ok: true, late: r.late });
}
