import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { updateOwnProfile, changeOwnPassword } from '@/lib/auth/profile';

/** POST { action: 'update' | 'password', … } — Meu Perfil (o próprio usuário). */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  let r;
  if (b.action === 'update') r = await updateOwnProfile(user, { name: b.name, cpf: b.cpf }, ctx);
  else if (b.action === 'password') r = await changeOwnPassword(user, String(b.currentPassword ?? ''), String(b.newPassword ?? ''), ctx);
  else return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });

  if (!r.ok) return NextResponse.json({ error: ('detail' in r && r.detail) || 'Dados inválidos' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
