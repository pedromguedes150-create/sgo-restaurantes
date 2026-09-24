import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { saveSnackDay, createSnackOption, updateSnackOption, toggleSnackOption, type SnackRowInput } from '@/lib/waste/salgados';

/**
 * Sobras Salgados (unidades).
 *  - salvar → grava o dia inteiro da unidade (substitui as linhas do dia)
 *  - opcao  → catálogo de tipos/motivos (só Admin/CEO; a lib confere)
 */
const RECUSAS: Record<string, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Sem permissão', status: 403 },
  INVALID: { msg: 'Dados inválidos', status: 400 },
  OPCAO_INVALIDA: { msg: 'Tipo ou motivo inválido/inativo. Recarregue a página.', status: 400 },
  DUPLICADO: { msg: 'Já existe uma opção com esse nome.', status: 409 },
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  if (b.action === 'salvar') {
    const rows: SnackRowInput[] = Array.isArray(b.rows)
      ? (b.rows as unknown[]).map((r) => {
          const o = r as { typeId?: unknown; reasonId?: unknown; quantity?: unknown };
          return { typeId: String(o.typeId ?? ''), reasonId: String(o.reasonId ?? ''), quantity: Number(o.quantity) };
        })
      : [];
    const r = await saveSnackDay(user, { unitId: String(b.unitId ?? ''), operationalDate: b.operationalDate ? String(b.operationalDate) : undefined, rows }, ctx);
    if (!r.ok) { const rc = RECUSAS[r.reason]; return NextResponse.json({ error: rc.msg }, { status: rc.status }); }
    return NextResponse.json({ ok: true, total: r.total, operationalDate: r.operationalDate });
  }

  if (b.action === 'opcao') {
    const op = String(b.op ?? '');
    let r;
    if (op === 'create') r = await createSnackOption(user, b.kind === 'MOTIVO' ? 'MOTIVO' : 'TIPO', String(b.name ?? ''), ctx);
    else if (op === 'update') r = await updateSnackOption(user, String(b.id ?? ''), String(b.name ?? ''), ctx);
    else if (op === 'toggle') r = await toggleSnackOption(user, String(b.id ?? ''), Boolean(b.active), ctx);
    else return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
    if (!r.ok) { const rc = RECUSAS[r.reason]; return NextResponse.json({ error: rc.msg }, { status: rc.status }); }
    return NextResponse.json({ ok: true, id: r.id });
  }

  return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
}
