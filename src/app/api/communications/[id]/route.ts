import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { updateCommunication, setCommunicationPinned } from '@/lib/communications/update';
import type { CommLink } from '@/lib/communications/create';
import type { CommunicationPriority } from '@prisma/client';

const STATUS: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400, NO_RECIPIENTS: 400 };
const MSG: Record<string, string> = {
  FORBIDDEN: 'Apenas o autor pode editar este comunicado',
  NOT_FOUND: 'Comunicado não encontrado',
  INVALID: 'Preencha título, mensagem e prazo',
  NO_RECIPIENTS: 'Nenhum destinatário: selecione unidades (com gerentes) ou pessoas',
};

/** POST { action: 'update' | 'pin', ... } — edição do comunicado (só o autor). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  if (b.action === 'pin') {
    const r = await setCommunicationPinned(user, params.id, Boolean(b.pinned), ctx);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: MSG[r.reason] }, { status: STATUS[r.reason] });
  }

  if (b.action === 'update') {
    const r = await updateCommunication(user, params.id, {
      title: typeof b.title === 'string' ? b.title : undefined,
      body: typeof b.body === 'string' ? b.body : undefined,
      priority: typeof b.priority === 'string' ? (b.priority as CommunicationPriority) : undefined,
      requiresResponse: typeof b.requiresResponse === 'boolean' ? b.requiresResponse : undefined,
      pinned: typeof b.pinned === 'boolean' ? b.pinned : undefined,
      dueAt: typeof b.dueAt === 'string' ? b.dueAt : undefined,
      links: Array.isArray(b.links) ? (b.links as CommLink[]) : undefined,
      unitIds: Array.isArray(b.unitIds) ? b.unitIds.map(String) : undefined,
      extraUserIds: Array.isArray(b.extraUserIds) ? b.extraUserIds.map(String) : undefined,
      confirm: b.confirm === true,
    }, ctx);

    if (!r.ok) return NextResponse.json({ error: MSG[r.reason] }, { status: STATUS[r.reason] });
    if (!r.applied) return NextResponse.json({ ok: true, needsConfirm: true, summary: r.summary });
    return NextResponse.json({ ok: true, applied: true, summary: r.summary });
  }

  return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
}
