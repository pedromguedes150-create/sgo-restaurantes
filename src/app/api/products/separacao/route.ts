import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth/session';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { requestContext } from '@/lib/auth/service';
import { separarItem, desfazerItem } from '@/lib/products/separacao';

/**
 * A separação no CD, item a item.
 *
 * Cada toque do separador é uma chamada — é o que garante que fechar a página
 * não custa o trabalho já feito. O caso que exige cuidado aqui é o **409**:
 * quando outro separador já mexeu no item, a resposta não é um erro genérico,
 * e sim quem/quanto/quando, para a tela oferecer "manter" ou "sobrescrever".
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const negado = await guardaDaRota(user.role, req);
  if (negado) return negado;

  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  const r =
    b.action === 'separar'
      ? await separarItem(user, {
        itemId: String(b.itemId ?? ''),
        qty: Number(b.qty),
        missingReason: b.missingReason ? String(b.missingReason) : null,
        sobrescrever: Boolean(b.sobrescrever),
      }, ctx)
      : b.action === 'desfazer'
        ? await desfazerItem(user, String(b.itemId ?? ''))
        : null;

  if (!r) return NextResponse.json({ error: 'Operação desconhecida' }, { status: 400 });
  if (r.ok) return NextResponse.json({ ok: true, pedidoPronto: r.pedidoPronto });

  if (r.reason === 'CONFLITO') {
    return NextResponse.json({
      error: `${r.porQuem} já separou este item.`, reason: 'CONFLITO',
      porQuem: r.porQuem, quantidade: r.quantidade, quando: r.quando,
    }, { status: 409 });
  }

  const status: Record<string, number> = { FORBIDDEN: 403, NAO_ENCONTRADO: 404, JA_ENVIADO: 409, INVALID: 400 };
  return NextResponse.json(
    { error: r.detalhe ?? 'Não foi possível registrar', reason: r.reason },
    { status: status[r.reason] ?? 400 },
  );
}
