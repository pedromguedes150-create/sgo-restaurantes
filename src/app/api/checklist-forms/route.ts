import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import {
  listChecklistForms, getChecklistFormForEdit, createChecklistForm, updateChecklistForm,
  rotatePublicToken, saveField, deleteField, reorderFields,
} from '@/lib/checklist-forms/config';
import type { ChecklistFieldKind } from '@prisma/client';

const STATUS: Record<string, number> = { FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400 };
const MSG: Record<string, string> = {
  FORBIDDEN: 'Sem permissão para configurar fichas',
  NOT_FOUND: 'Ficha não encontrada',
  INVALID: 'Dados inválidos',
};
function fail(reason: 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID') {
  return NextResponse.json({ error: MSG[reason] }, { status: STATUS[reason] });
}

/** GET (lista) | GET ?id= (editar uma ficha). */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const id = new URL(req.url).searchParams.get('id');
  if (id) {
    const data = await getChecklistFormForEdit(user, id);
    if (!data) return fail('FORBIDDEN');
    return NextResponse.json(data);
  }
  const list = await listChecklistForms(user);
  if (!list) return fail('FORBIDDEN');
  return NextResponse.json({ forms: list });
}

/** POST { action, … } — criar/editar ficha e campos. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  if (b.action === 'create') {
    const r = await createChecklistForm(user, { unitId: String(b.unitId ?? ''), title: String(b.title ?? ''), description: b.description }, ctx);
    return r.ok ? NextResponse.json({ ok: true, id: r.id }) : fail(r.reason);
  }
  if (b.action === 'update') {
    const r = await updateChecklistForm(user, String(b.id ?? ''), {
      title: b.title, description: b.description, active: b.active, linkEnabled: b.linkEnabled,
      expiresAt: b.expiresAt === undefined ? undefined : (b.expiresAt || null),
      maxPerDay: b.maxPerDay != null ? Number(b.maxPerDay) : undefined,
      notifyRole: b.notifyRole === undefined ? undefined : (b.notifyRole || null),
    }, ctx);
    return r.ok ? NextResponse.json({ ok: true }) : fail(r.reason);
  }
  if (b.action === 'rotateToken') {
    const r = await rotatePublicToken(user, String(b.id ?? ''), ctx);
    return r.ok ? NextResponse.json({ ok: true, token: r.token }) : fail(r.reason);
  }
  if (b.action === 'saveField') {
    const r = await saveField(user, String(b.templateId ?? ''), {
      id: b.id ? String(b.id) : undefined,
      kind: String(b.kind ?? '') as ChecklistFieldKind,
      label: String(b.label ?? ''),
      section: b.section ?? null,
      required: Boolean(b.required),
      options: Array.isArray(b.options) ? b.options.map(String) : [],
    }, ctx);
    return r.ok ? NextResponse.json({ ok: true, id: r.id }) : fail(r.reason);
  }
  if (b.action === 'deleteField') {
    const r = await deleteField(user, String(b.id ?? ''), ctx);
    return r.ok ? NextResponse.json({ ok: true }) : fail(r.reason);
  }
  if (b.action === 'reorder') {
    const r = await reorderFields(user, String(b.templateId ?? ''), Array.isArray(b.orderedIds) ? b.orderedIds.map(String) : [], ctx);
    return r.ok ? NextResponse.json({ ok: true }) : fail(r.reason);
  }
  return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
}
