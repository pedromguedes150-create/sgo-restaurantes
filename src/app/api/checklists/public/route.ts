import { NextResponse } from 'next/server';
import { requestContext } from '@/lib/auth/service';
import { submitChecklist } from '@/lib/checklist-forms/public';

/** Pública (link da ficha, sem login) — registra um preenchimento. */
export async function POST(req: Request) {
  const b = await req.json().catch(() => null);
  if (!b?.token || !b?.collaboratorId) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);
  const r = await submitChecklist({
    token: String(b.token),
    collaboratorId: String(b.collaboratorId),
    answers: (b.answers && typeof b.answers === 'object') ? b.answers : {},
    honeypot: typeof b.honeypot === 'string' ? b.honeypot : '',
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  if (!r.ok) {
    const map: Record<string, number> = { NOT_FOUND: 404, INVALID: 400, THROTTLED: 429 };
    return NextResponse.json({ error: r.detail ?? (r.reason === 'NOT_FOUND' ? 'Link inválido ou desativado' : 'Não foi possível enviar') }, { status: map[r.reason] });
  }
  return NextResponse.json({ ok: true });
}
