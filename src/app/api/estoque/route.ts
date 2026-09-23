import { NextResponse } from 'next/server';
import { guardaDaRota } from '@/lib/permissions/guarda-rota-api';
import { reasonResponse } from '@/lib/api/reason';
import { getSessionUser } from '@/lib/auth/session';
import { requestContext } from '@/lib/auth/service';
import { biparCodigo, cadastrarProduto, sugerirSetor, vincularCodigo } from '@/lib/stock/catalogo';
import { lancarEntrada, registrarContagem, tratarLote, type Tratativa } from '@/lib/stock/lotes';
import { transferirLote } from '@/lib/stock/transferencia';

const REASONS: Record<string, { msg: string; status: number }> = {
  FORBIDDEN: { msg: 'Sem acesso a esta unidade', status: 403 },
  INVALID: { msg: 'Dados inválidos', status: 400 },
  NAO_ENCONTRADO: { msg: 'Produto ou lote não encontrado', status: 404 },
  SEM_VALIDADE: { msg: 'Este produto controla validade — informe a data do lote.', status: 400 },
  ENCERRADO: { msg: 'Este lote já foi encerrado.', status: 409 },
  CODIGO_INVALIDO: { msg: 'Código de barras inválido.', status: 400 },
  JA_VINCULADO: { msg: 'Este código já pertence a outro produto.', status: 409 },
  JA_LANCADO: { msg: 'Este item do pedido já foi lançado no estoque.', status: 409 },
  DESTINO_INVALIDO: { msg: 'Escolha a unidade que vai receber.', status: 400 },
  SALDO_INSUFICIENTE: { msg: 'O lote não tem esse saldo.', status: 409 },
};

const TRATATIVAS: Tratativa[] = ['FINALIZADO', 'AINDA_TEM', 'DESCARTE', 'TRANSFERIDO'];

export async function POST(req: Request) {
  try {
    return await tratar(req);
  } catch (e) {
    /* Mesma rede de segurança das demais rotas: sem ela uma exceção vira 500
       com corpo HTML, o `res.json()` do cliente estoura e a tela diz só
       "Falha" — indiagnosticável de longe. */
    console.error('[api/estoque] erro não tratado:', e);
    return NextResponse.json({ error: 'Erro inesperado no estoque. Tente novamente e, se repetir, avise o Admin.' }, { status: 500 });
  }
}

async function tratar(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const barrado = await guardaDaRota(user.role, req);
  if (barrado) return barrado;

  const b = await req.json().catch(() => null);
  const acao = String(b?.action ?? '');
  const ctx = requestContext(req);

  /* BIPAR é leitura: não grava nada, e por isso responde rápido e sem
     confirmação. Todo o resto é declaração e passa por uma função que audita. */
  if (acao === 'bipar') {
    const r = await biparCodigo(String(b?.codigo ?? ''), b?.termo ? String(b.termo) : undefined);
    if (r.achado === 'CODIGO_INVALIDO') return reasonResponse(REASONS, 'CODIGO_INVALIDO');
    return NextResponse.json({ ok: true, ...r });
  }

  if (acao === 'vincular') {
    const r = await vincularCodigo(user, String(b?.productId ?? ''), String(b?.codigo ?? ''));
    if (!r.ok) return reasonResponse(REASONS, r.reason, r.message);
    return NextResponse.json({ ok: true, produto: r.produto });
  }

  /* Sugestão de setor: leitura pura, nada grava. A tela chama assim que o nome
     é digitado, para o gerente já ver o setor proposto e poder trocar. */
  if (acao === 'sugerirSetor') {
    return NextResponse.json({ ok: true, ...(await sugerirSetor(String(b?.name ?? ''), b?.category ? String(b.category) : null)) });
  }

  if (acao === 'cadastrar') {
    const r = await cadastrarProduto(user, {
      name: String(b?.name ?? ''),
      category: b?.category ? String(b.category) : undefined,
      measure: b?.measure ? String(b.measure) : undefined,
      packType: b?.packType ? String(b.packType) : undefined,
      packSize: b?.packSize != null ? Number(b.packSize) : null,
      trackExpiry: Boolean(b?.trackExpiry),
      alertDays: b?.alertDays != null ? Number(b.alertDays) : undefined,
      codigo: b?.codigo ? String(b.codigo) : null,
      cdSectorId: b?.cdSectorId ? String(b.cdSectorId) : null,
    });
    if (!r.ok) return reasonResponse(REASONS, r.reason, r.message);
    return NextResponse.json({ ok: true, produto: r.produto });
  }

  if (acao === 'entrada') {
    const r = await lancarEntrada(user, {
      unitId: String(b?.unitId ?? ''),
      productId: String(b?.productId ?? ''),
      quantidade: Number(b?.quantidade),
      lotCode: b?.lotCode ? String(b.lotCode) : null,
      expiresAt: b?.expiresAt ? String(b.expiresAt) : null,
      note: b?.note ? String(b.note) : null,
      requestItemId: b?.requestItemId ? String(b.requestItemId) : null,
    }, ctx);
    if (!r.ok) return reasonResponse(REASONS, r.reason, r.message);
    return NextResponse.json({ ok: true, lotId: r.lotId, unidades: r.unidades });
  }

  if (acao === 'transferir') {
    const r = await transferirLote(user, {
      lotId: String(b?.lotId ?? ''),
      paraUnitId: String(b?.paraUnitId ?? ''),
      quantidade: b?.quantidade != null && b.quantidade !== '' ? Number(b.quantidade) : null,
      note: b?.note ? String(b.note) : null,
    }, ctx);
    if (!r.ok) return reasonResponse(REASONS, r.reason, r.message);
    return NextResponse.json({ ok: true, destinoLotId: r.destinoLotId, unidades: r.unidades, origemEncerrada: r.origemEncerrada });
  }

  if (acao === 'contagem') {
    const r = await registrarContagem(user, String(b?.lotId ?? ''), Number(b?.quantidade), b?.note ? String(b.note) : null, ctx);
    if (!r.ok) return reasonResponse(REASONS, r.reason, r.message);
    return NextResponse.json({ ok: true, unidades: r.unidades });
  }

  if (acao === 'tratativa') {
    const t = String(b?.tratativa ?? '') as Tratativa;
    if (!TRATATIVAS.includes(t)) return reasonResponse(REASONS, 'INVALID');
    const r = await tratarLote(user, String(b?.lotId ?? ''), t, {
      quantidade: b?.quantidade != null ? Number(b.quantidade) : undefined,
      note: b?.note ? String(b.note) : null,
      paraUnitId: b?.paraUnitId ? String(b.paraUnitId) : null,
    }, ctx);
    if (!r.ok) return reasonResponse(REASONS, r.reason, r.message);
    return NextResponse.json({ ok: true, status: r.status, saldo: r.saldo });
  }

  return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 });
}
