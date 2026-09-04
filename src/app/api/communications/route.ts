import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { reasonResponse } from '@/lib/api/reason';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { createCommunication, canAuthorCommunications, type CommLink } from '@/lib/communications/create';
import { saveAttachment, UploadError } from '@/lib/uploads';
import type { CommunicationPriority } from '@prisma/client';

const REASONS: Record<string, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Apenas supervisão/administração pode publicar comunicados', status: 403 },
  INVALID: { msg: 'Preencha título, mensagem e prazo de confirmação', status: 400 },
  NO_RECIPIENTS: { msg: 'Nenhum destinatário: selecione unidades (com gerentes) ou pessoas', status: 400 },
};

function parseArr(v: FormDataEntryValue | null): string[] {
  if (!v) return [];
  try { const a = JSON.parse(String(v)); return Array.isArray(a) ? a.map(String) : []; } catch { return []; }
}
function parseLinks(v: FormDataEntryValue | null): CommLink[] {
  if (!v) return [];
  try { const a = JSON.parse(String(v)); return Array.isArray(a) ? a.filter((x) => x?.url).map((x) => ({ label: String(x.label ?? ''), url: String(x.url) })) : []; } catch { return []; }
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;
  if (!canAuthorCommunications(user)) return NextResponse.json({ error: REASONS.FORBIDDEN.msg }, { status: 403 });

  let input: Parameters<typeof createCommunication>[1];
  const attachments: { path: string; mimeType: string; name?: string }[] = [];
  const contentType = req.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const files = form.getAll('attachments').filter((f): f is File => f instanceof File && f.size > 0);
      let i = 0;
      for (const f of files) {
        const saved = await saveAttachment(f, 'comm', `comm-${Date.now()}-${i++}`);
        attachments.push({ ...saved, name: f.name });
      }
      input = {
        title: String(form.get('title') ?? ''),
        body: String(form.get('body') ?? ''),
        priority: (String(form.get('priority') ?? 'NORMAL') as CommunicationPriority),
        pinned: String(form.get('pinned') ?? '') === 'true',
        requiresResponse: String(form.get('requiresResponse') ?? '') === 'true',
        links: parseLinks(form.get('links')),
        dueAt: String(form.get('dueAt') ?? ''),
        unitIds: parseArr(form.get('unitIds')),
        extraUserIds: parseArr(form.get('extraUserIds')),
        attachments,
      };
    } else {
      const b = await req.json();
      input = {
        title: b.title, body: b.body, priority: b.priority, pinned: b.pinned, requiresResponse: b.requiresResponse,
        links: Array.isArray(b.links) ? b.links : [], dueAt: b.dueAt, unitIds: b.unitIds ?? [], extraUserIds: b.extraUserIds ?? [],
      };
    }
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 422 });
    return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  }

  const r = await createCommunication(user, input, requestContext(req));
  if (!r.ok) {
    return reasonResponse(REASONS, r.reason);
  }
  return NextResponse.json({ ok: true, id: r.id, recipients: r.recipients });
}
