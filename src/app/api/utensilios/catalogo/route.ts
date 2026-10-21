import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { adicionarUtensilio, ativarUtensilio, moverUtensilio, renomearUtensilio } from '@/lib/utensilios/catalogo';

/** Lista padrão de utensílios (Configurações → Utensílios): adicionar, renomear, ativar/desativar, mover. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const barrado = await guardaDaRota(user.role, req);
  if (barrado) return barrado;
  const b = await req.json().catch(() => ({}));
  const ctx = requestContext(req);
  const acao = String(b?.acao ?? '');
  const id = String(b?.id ?? '');
  const r = acao === 'adicionar' ? await adicionarUtensilio(user, String(b?.nome ?? ''), ctx)
    : acao === 'renomear' ? await renomearUtensilio(user, id, String(b?.nome ?? ''), ctx)
    : acao === 'ativar' ? await ativarUtensilio(user, id, b?.active === true, ctx)
    : acao === 'mover' ? await moverUtensilio(user, id, b?.direcao === 'cima' ? 'cima' : 'baixo', ctx)
    : ({ ok: false, reason: 'INVALID', message: 'Ação desconhecida.' } as const);
  if (!r.ok) return NextResponse.json({ error: r.message ?? (r.reason === 'FORBIDDEN' ? 'Só o Administrador edita a lista padrão.' : r.reason === 'NOT_FOUND' ? 'Item não encontrado.' : 'Dados inválidos.'), reason: r.reason }, { status: r.reason === 'FORBIDDEN' ? 403 : r.reason === 'NOT_FOUND' ? 404 : 400 });
  return NextResponse.json(r);
}
