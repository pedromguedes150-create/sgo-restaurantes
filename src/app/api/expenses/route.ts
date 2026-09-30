import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { saveAttachment, removeUpload, UploadError } from '@/lib/uploads';
import { createExpense, type CreateExpenseReason } from '@/lib/expenses/create';
import { VALOR_MAXIMO } from '@/lib/expenses/tipos';

/**
 * Nova despesa (multipart: comprovante OPCIONAL). Não existe campo de origem:
 * a rota não lê nenhum, e `createExpense` grava SAFE. A unidade vem do corpo,
 * mas só passa se estiver no alcance da sessão — conferido ANTES de gravar o
 * arquivo, para não deixar upload órfão de quem não podia lançar.
 */
const REASONS: Record<CreateExpenseReason, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Você não pode lançar despesa nesta unidade.', status: 403 },
  INVALID: { msg: 'Dados inválidos.', status: 400 },
  SEM_DESCRICAO: { msg: 'Descreva o motivo da despesa.', status: 400 },
  DATA_FUTURA: { msg: 'A data da despesa não pode ser futura.', status: 400 },
  CATEGORIA: { msg: 'Escolha uma categoria.', status: 400 },
  VALOR: { msg: `Informe um valor maior que zero (até R$ ${VALOR_MAXIMO.toLocaleString('pt-BR')}).`, status: 400 },
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const txt = (k: string) => { const v = form.get(k); return typeof v === 'string' ? v.trim() : ''; };
  const unitId = txt('unitId');
  if (!unitId || !canAccessUnit(user, unitId)) return NextResponse.json({ error: REASONS.FORBIDDEN.msg }, { status: 403 });

  let receiptPath: string | null = null;
  const comprovante = form.get('receipt');
  if (comprovante instanceof File && comprovante.size > 0) {
    try {
      receiptPath = (await saveAttachment(comprovante, unitId, `despesa-${Date.now()}`)).path;
    } catch (e) {
      if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 422 });
      throw e;
    }
  }

  const r = await createExpense(user, {
    unitId,
    expenseDate: txt('expenseDate') || null,
    amount: Number(String(form.get('amount') ?? '').replace(',', '.')),
    category: txt('category'),
    description: txt('description'),
    receiptPath,
  }, requestContext(req));

  if (!r.ok) {
    /* A foto foi gravada antes de a regra decidir; recusada a despesa, o
       arquivo sai junto (senão vira órfão no volume — achado da v1.96.0). */
    if (receiptPath) await removeUpload(receiptPath);
    const m = REASONS[r.reason];
    return NextResponse.json({ error: m.msg, reason: r.reason }, { status: m.status });
  }
  return NextResponse.json({ ok: true, id: r.id });
}
