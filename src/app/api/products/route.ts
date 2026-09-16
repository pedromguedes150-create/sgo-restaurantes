import { NextResponse } from 'next/server';
import { recusaDeAba } from '@/lib/permissions/guarda-abas';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { setRequestStatus, upsertProduct, toggleProduct, deleteProduct } from '@/lib/products';

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const b = await req.json().catch(() => null);
  /* Aba fechada na matriz de perfis não grava — esconder o botão é
     conveniência, recusar aqui é o controle. */
  const negado = b?.action ? await recusaDeAba(user.role, 'PRODUCTS', String(b.action)) : null;
  if (negado) return negado;
  if (!b?.action) return NextResponse.json({ error: 'Requisição inválida' }, { status: 400 });
  const ctx = requestContext(req);

  /* A ação `order` saiu daqui. Ela gravava pelo caminho antigo — itens num JSON,
     sem `ProductRequestItem`, sem setor do CD e com status `NEW`, que a tela de
     separação nem consulta: o pedido nascia invisível para o separador. Pedido
     agora é só por `/api/products/pedido` (criarPedido). Manter a rota viva
     seria deixar a porta aberta para recriar o problema por fora da tela. */
  let r: { ok: boolean; reason?: string } | undefined;
  if (b.action === 'status') r = await setRequestStatus(user, String(b.id ?? ''), String(b.status ?? ''), ctx);
  else if (b.action === 'catUpsert') r = await upsertProduct(user, {
    id: b.id ? String(b.id) : undefined, name: String(b.name ?? ''), origin: String(b.origin ?? ''),
    category: b.category, measure: b.measure,
    /* undefined = "nao mexe"; null = "apaga". A distincao importa ao editar um
       produto que ja tem codigo de barras. */
    ...(b.packSize !== undefined ? { packSize: b.packSize === null ? null : Number(b.packSize) } : {}),
    ...(b.barcode !== undefined ? { barcode: b.barcode === null ? null : String(b.barcode) } : {}),
    cdSectorId: b.cdSectorId ? String(b.cdSectorId) : null,
  });
  else if (b.action === 'catToggle') r = await toggleProduct(user, String(b.id ?? ''), Boolean(b.active));
  else if (b.action === 'catDelete') r = await deleteProduct(user, String(b.id ?? ''));

  if (!r) return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
  if (!r.ok) {
    /* "Dados inválidos" não diria QUAL dado. O setor do CD é o campo novo e o
       que mais vai faltar nos 1.184 produtos já cadastrados. */
    const msg =
      r.reason === 'FORBIDDEN' ? 'Sem permissão' :
      r.reason === 'SEM_SETOR' ? 'Escolha o Setor do CD: sem ele o produto não chega a separador nenhum.' :
      'Dados inválidos';
    return NextResponse.json({ error: msg, reason: r.reason }, { status: r.reason === 'FORBIDDEN' ? 403 : 400 });
  }
  return NextResponse.json({ ok: true });
}
