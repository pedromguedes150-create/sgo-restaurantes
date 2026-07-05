import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { completeChecklist, type ItemAnswer } from '@/lib/tasks/complete';
import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { saveAttachment, UploadError } from '@/lib/uploads';

const MSG: Record<string, { msg: string; status: number }> = {
  NOT_FOUND: { msg: 'Tarefa não encontrada', status: 404 },
  FORBIDDEN: { msg: 'Sem acesso a esta tarefa', status: 403 },
  EVIDENCE_REQUIRED: { msg: 'Este checklist exige ao menos uma foto', status: 422 },
  ALREADY_DONE: { msg: 'Checklist já concluído', status: 409 },
};

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const instanceId = params.id;

  const inst = await prisma.taskInstance.findUnique({ where: { id: instanceId }, select: { unitId: true } });
  if (!inst) return NextResponse.json({ error: 'Tarefa não encontrada' }, { status: 404 });
  if (!canAccessUnit(user, inst.unitId)) return NextResponse.json({ error: 'Sem acesso' }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });

  let items: ItemAnswer[] = [];
  try { items = JSON.parse(String(form.get('items') ?? '[]')); } catch { items = []; }

  // até 5 fotos, cada uma ligada (opcionalmente) ao item que a exigiu
  const files = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0).slice(0, 5);
  let photoItemIds: (string | null)[] = [];
  try { photoItemIds = JSON.parse(String(form.get('photoItemIds') ?? '[]')); } catch { photoItemIds = []; }
  const photos: { path: string; itemId: string | null }[] = [];
  for (let i = 0; i < files.length; i++) {
    try {
      const saved = await saveAttachment(files[i], inst.unitId, `checklist-${instanceId}`);
      photos.push({ path: saved.path, itemId: (photoItemIds[i] as string) || null });
    } catch (e) {
      return NextResponse.json({ error: e instanceof UploadError ? e.message : 'Falha no anexo' }, { status: 422 });
    }
  }

  const r = await completeChecklist(instanceId, user, { items, photos }, requestContext(req));
  if (!r.ok) { const m = MSG[r.reason]; return NextResponse.json({ error: m.msg, reason: r.reason }, { status: m.status }); }
  return NextResponse.json({ ok: true });
}
