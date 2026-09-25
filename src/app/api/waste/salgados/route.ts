import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { saveSnackDay, createSnackOption, updateSnackOption, toggleSnackOption, type SnackRowInput } from '@/lib/waste/salgados';
import { saveEvidence, UploadError } from '@/lib/uploads';
import { canAccessUnit } from '@/lib/scope/unit-scope';

/**
 * Sobras Salgados (unidades).
 *  - salvar → grava o dia inteiro da unidade (substitui as linhas do dia)
 *             Aceita multipart/form-data (com evidence) ou JSON (sem foto).
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

  const ctx = requestContext(req);
  const contentType = req.headers.get('content-type') ?? '';

  // Lê o corpo: multipart (quando há foto) ou JSON.
  let action = '';
  let unitId = '';
  let operationalDate: string | undefined;
  let rows: SnackRowInput[] = [];
  let evidencePath: string | undefined;
  let opData: Record<string, unknown> = {};

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      action = String(form.get('action') ?? '');
      unitId = String(form.get('unitId') ?? '');
      operationalDate = (form.get('operationalDate') as string) || undefined;
      rows = JSON.parse(String(form.get('rows') ?? '[]'));
      const file = form.get('evidence');
      if (file instanceof File && file.size > 0) {
        if (!canAccessUnit(user, unitId)) {
          return NextResponse.json({ error: 'Sem acesso a esta unidade' }, { status: 403 });
        }
        evidencePath = await saveEvidence(file, unitId, `snack-${operationalDate ?? 'hoje'}`);
      }
    } else {
      const b = await req.json().catch(() => null);
      if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
      action = String(b.action);
      unitId = String(b.unitId ?? '');
      operationalDate = b.operationalDate ? String(b.operationalDate) : undefined;
      rows = Array.isArray(b.rows) ? b.rows : [];
      opData = b;
    }
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 422 });
    return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  }

  if (action === 'salvar') {
    const parsedRows: SnackRowInput[] = (rows as unknown[]).map((r) => {
      const o = r as { typeId?: unknown; reasonId?: unknown; quantity?: unknown };
      return { typeId: String(o.typeId ?? ''), reasonId: String(o.reasonId ?? ''), quantity: Number(o.quantity) };
    });
    const r = await saveSnackDay(user, { unitId, operationalDate, rows: parsedRows, evidencePath }, ctx);
    if (!r.ok) { const rc = RECUSAS[r.reason]; return NextResponse.json({ error: rc.msg }, { status: rc.status }); }
    return NextResponse.json({ ok: true, total: r.total, operationalDate: r.operationalDate });
  }

  if (action === 'opcao') {
    const op = String(opData.op ?? '');
    let r;
    if (op === 'create') r = await createSnackOption(user, opData.kind === 'MOTIVO' ? 'MOTIVO' : 'TIPO', String(opData.name ?? ''), ctx);
    else if (op === 'update') r = await updateSnackOption(user, String(opData.id ?? ''), String(opData.name ?? ''), ctx);
    else if (op === 'toggle') r = await toggleSnackOption(user, String(opData.id ?? ''), Boolean(opData.active), ctx);
    else return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
    if (!r.ok) { const rc = RECUSAS[r.reason]; return NextResponse.json({ error: rc.msg }, { status: rc.status }); }
    return NextResponse.json({ ok: true, id: r.id });
  }

  return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
}
