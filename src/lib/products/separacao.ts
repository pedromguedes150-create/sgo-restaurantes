import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import type { UnidadeDePedido } from '@/lib/products/embalagem-pedido';
import { notifyUsers } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';
import { motivoLabel } from './separacao-motivos';
import { numeroDoPedido } from './numero-do-pedido';
import { carregarPedidoSemEscopoDeUnidade, type PedidoDetalhado } from './pedido';

/**
 * SEPARAÇÃO no CD — item a item, com quatro setores ao mesmo tempo.
 *
 * Duas regras dão forma a tudo aqui:
 *
 * 1. **Cada item é gravado na hora.** O separador fecha a página, perde o sinal,
 *    bloqueia o celular — e ao voltar continua de onde parou. Guardar tudo para
 *    o fim é como se perde meia hora de trabalho num corredor sem sinal.
 *
 * 2. **Ninguém sobrescreve ninguém em silêncio.** Dois separadores do mesmo
 *    setor podem abrir o mesmo pedido; se o segundo gravar por cima sem saber,
 *    o trabalho do primeiro some sem erro nenhum. Aqui a segunda gravação
 *    **para e conta quem já mexeu**, e a decisão é de quem está na tela.
 */

/* Os motivos vivem num arquivo SEM imports para a TELA poder usa-los — este
   aqui puxa o Prisma. Reexportados para quem ja os importava daqui. */
export { MOTIVOS_DE_FALTA, motivoLabel, type MotivoDeFalta } from './separacao-motivos';

export type ResultadoDaSeparacao =
  | { ok: true; pedidoPronto: boolean }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NAO_ENCONTRADO' | 'JA_ENVIADO'; detalhe?: string }
  | {
    ok: false; reason: 'CONFLITO';
    /* Quem mexeu antes, quanto separou e quando — é o que a tela mostra para a
       pessoa decidir entre manter e sobrescrever. */
    porQuem: string; quantidade: number | null; quando: Date | null;
  };

/** O setor do usuário. ADMIN/CEO não têm setor e enxergam tudo. */
async function meuSetor(user: SessionUser): Promise<{ id: string | null; vejoTudo: boolean }> {
  const vejoTudo = user.role === 'ADMIN' || user.role === 'CEO';
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { cdSectorId: true } });
  return { id: u?.cdSectorId ?? null, vejoTudo };
}

/**
 * Separa (ou marca falta em) um item.
 *
 * `qty` é o que REALMENTE foi separado: menor que o pedido registra a falta e o
 * motivo, e **não impede** concluir o setor — foi o pedido explícito. Zero com
 * motivo é o item que não saiu.
 */
export async function separarItem(
  user: SessionUser,
  input: { itemId: string; qty: number; missingReason?: string | null; sobrescrever?: boolean },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoDaSeparacao> {
  const item = await prisma.productRequestItem.findUnique({
    where: { id: input.itemId },
    include: { request: { select: { id: true, number: true, status: true, unitId: true, createdById: true } } },
  });
  if (!item) return { ok: false, reason: 'NAO_ENCONTRADO' };

  const { id: setor, vejoTudo } = await meuSetor(user);
  /* O separador só toca no setor DELE — é o que impede separar a lista do
     colega por engano. */
  if (!vejoTudo && (!setor || item.cdSectorId !== setor)) return { ok: false, reason: 'FORBIDDEN' };

  /* Pedido já enviado à unidade é registro fechado: mexer nele agora mudaria o
     que a unidade recebeu depois de ter recebido. */
  if (!['ENVIADO_CD', 'SEPARANDO', 'PRONTO_ENVIO'].includes(item.request.status)) {
    return { ok: false, reason: 'JA_ENVIADO', detalhe: 'Este pedido já saiu do CD.' };
  }

  if (!Number.isFinite(input.qty) || input.qty < 0) return { ok: false, reason: 'INVALID', detalhe: 'Quantidade inválida.' };
  const qty = Math.round(input.qty * 1000) / 1000;
  if (qty > Number(item.qtyRequested)) {
    return { ok: false, reason: 'INVALID', detalhe: `O pedido é de ${Number(item.qtyRequested)} ${item.measure}. Não dá para separar mais do que foi pedido.` };
  }
  const faltou = qty < Number(item.qtyRequested);
  if (faltou && !input.missingReason) {
    return { ok: false, reason: 'INVALID', detalhe: 'Separando menos do que foi pedido, informe o motivo.' };
  }

  /* ── A guarda contra sobrescrita silenciosa ── */
  if (item.separatedAt && item.separatedById !== user.id && !input.sobrescrever) {
    return {
      ok: false, reason: 'CONFLITO',
      porQuem: item.separatedByName ?? 'outro separador',
      quantidade: item.qtySeparated === null ? null : Number(item.qtySeparated),
      quando: item.separatedAt,
    };
  }

  /* Fotografia do setor ANTES da gravação: é o que distingue "o setor acabou
     agora" de "alguém corrigiu um item num setor que já estava pronto". */
  const setorJaEstavaPronto = (await prisma.productRequestItem.count({
    where: { requestId: item.request.id, cdSectorId: item.cdSectorId, qtySeparated: null },
  })) === 0;

  await prisma.productRequestItem.update({
    where: { id: item.id },
    data: {
      qtySeparated: new Prisma.Decimal(qty),
      missingReason: faltou ? (input.missingReason ?? null) : null,
      separatedById: user.id, separatedByName: user.name, separatedAt: new Date(),
    },
  });

  const pedidoPronto = await recalcularStatusDoPedido(item.request.id, user, ctx);
  await avisarFaltasDoSetor(item.request.id, item.cdSectorId, item.request.createdById, setorJaEstavaPronto);

  await audit({
    userId: user.id, unitId: item.request.unitId, action: 'PRODUCT_ITEM_SEPARATED', module: 'PRODUCTS',
    entity: 'product_request_item', entityId: item.id,
    metadata: { pedido: item.request.number, produto: item.name, pedido_qtd: Number(item.qtyRequested), separado: qty, motivo: input.missingReason ?? null }, ...ctx,
  });

  return { ok: true, pedidoPronto };
}

/**
 * Avisa o gerente das faltas de UM setor, no momento em que aquele setor
 * termina — e uma vez só.
 *
 * O "quando" é a decisão que importa aqui. A cada item seria spam, e o gerente
 * passaria a ignorar o sino. Só no fim do pedido inteiro chegaria tarde: ele
 * descobre a falta quando a carga já está a caminho, sem tempo de comprar fora
 * ou pedir a outra unidade. O fim de cada setor é o primeiro instante em que a
 * falta é **definitiva** e ainda dá para reagir.
 *
 * Dispara só na TRANSIÇÃO para completo: se o setor já estava pronto antes
 * desta gravação, era correção de lançamento, e o gerente já foi avisado.
 */
async function avisarFaltasDoSetor(
  requestId: string,
  cdSectorId: string | null,
  gerenteId: string | null,
  jaEstavaPronto: boolean,
): Promise<void> {
  if (!gerenteId || jaEstavaPronto) return;

  const itens = await prisma.productRequestItem.findMany({
    where: { requestId, cdSectorId },
    select: { name: true, measure: true, qtyRequested: true, qtySeparated: true, missingReason: true, cdSectorName: true },
  });
  if (itens.length === 0 || itens.some((i) => i.qtySeparated === null)) return;

  const faltas = itens.filter((i) => Number(i.qtySeparated) < Number(i.qtyRequested));
  if (faltas.length === 0) return;

  const pedido = await prisma.productRequest.findUnique({
    where: { id: requestId }, select: { number: true, createdAt: true },
  });
  if (!pedido) return;

  /* Uma notificação com TODAS as faltas do setor, não uma por item. */
  const lista = faltas
    .slice(0, 4)
    .map((i) => `${i.name}: pedido ${Number(i.qtyRequested)} ${i.measure}, separado ${Number(i.qtySeparated)}${motivoLabel(i.missingReason) ? ` (${motivoLabel(i.missingReason)})` : ''}`)
    .join('; ');
  const resto = faltas.length > 4 ? ` e mais ${faltas.length - 4}` : '';
  const setorNome = itens[0].cdSectorName ?? 'Sem setor';

  await notifyUsers([gerenteId], {
    title: `⚠️ Falta no ${numeroDoPedido(pedido.number, pedido.createdAt)}`,
    body: `${setorNome} concluiu com ${faltas.length === 1 ? 'uma falta' : `${faltas.length} faltas`} — ${lista}${resto}.`,
    link: `/modulos/produtos/pedido/${requestId}`, module: 'PRODUCTS',
  }).catch(() => {});
}

/** Desfaz a separação de um item — o separador se enganou e quer refazer. */
export async function desfazerItem(user: SessionUser, itemId: string): Promise<ResultadoDaSeparacao> {
  const item = await prisma.productRequestItem.findUnique({
    where: { id: itemId },
    include: { request: { select: { id: true, status: true } } },
  });
  if (!item) return { ok: false, reason: 'NAO_ENCONTRADO' };
  const { id: setor, vejoTudo } = await meuSetor(user);
  if (!vejoTudo && (!setor || item.cdSectorId !== setor)) return { ok: false, reason: 'FORBIDDEN' };
  if (!['ENVIADO_CD', 'SEPARANDO', 'PRONTO_ENVIO'].includes(item.request.status)) {
    return { ok: false, reason: 'JA_ENVIADO', detalhe: 'Este pedido já saiu do CD.' };
  }

  await prisma.productRequestItem.update({
    where: { id: itemId },
    data: { qtySeparated: null, missingReason: null, separatedById: null, separatedByName: null, separatedAt: null },
  });
  const pedidoPronto = await recalcularStatusDoPedido(item.request.id, user);
  return { ok: true, pedidoPronto };
}

/**
 * O status do pedido a partir dos itens.
 *
 * `PRONTO_ENVIO` só quando **todos** os itens foram tocados. Setor que não tem
 * item neste pedido não é esperado — a conta é sobre os itens que existem, e não
 * sobre os quatro setores do CD.
 */
async function recalcularStatusDoPedido(
  requestId: string,
  user: SessionUser,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<boolean> {
  const pedido = await prisma.productRequest.findUnique({
    where: { id: requestId },
    select: { id: true, number: true, status: true, unitId: true, createdById: true, requestItems: { select: { qtySeparated: true } } },
  });
  if (!pedido) return false;

  const total = pedido.requestItems.length;
  const tocados = pedido.requestItems.filter((i) => i.qtySeparated !== null).length;
  const novo = tocados === 0 ? 'ENVIADO_CD' : tocados < total ? 'SEPARANDO' : 'PRONTO_ENVIO';
  if (novo === pedido.status) return novo === 'PRONTO_ENVIO';

  await prisma.productRequest.update({ where: { id: requestId }, data: { status: novo } });

  /* O gerente é avisado UMA vez, quando a separação começa — e não a cada item
     separado, que encheria o sino dele e faria ignorar o aviso que importa. */
  if (pedido.status === 'ENVIADO_CD' && novo === 'SEPARANDO' && pedido.createdById) {
    await notifyUsers([pedido.createdById], {
      title: '📦 O CD iniciou a separação',
      body: `O pedido nº ${pedido.number} começou a ser separado.`,
      link: '/modulos/produtos', module: 'PRODUCTS',
    }).catch(() => {});
  }

  await audit({
    userId: user.id, unitId: pedido.unitId, action: 'PRODUCT_REQUEST_STATUS', module: 'PRODUCTS',
    entity: 'product_request', entityId: requestId,
    metadata: { pedido: pedido.number, de: pedido.status, para: novo, itens: `${tocados}/${total}` }, ...ctx,
  });

  return novo === 'PRONTO_ENVIO';
}

export interface ItemParaSeparar {
  id: string;
  name: string;
  category: string;
  measure: string;
  /** Como o gerente pediu — a tela do separador mostra "2 fardos". */
  packUnit: UnidadeDePedido;
  qtyRequested: number;
  qtySeparated: number | null;
  missingReason: string | null;
  missingLabel: string | null;
  separadoPor: string | null;
  separadoEm: Date | null;
  /** Quanto faltou. 0 quando saiu completo ou ainda não foi tocado. */
  faltando: number;
}

export interface PedidoParaSeparar {
  id: string;
  number: number;
  unitName: string;
  createdAt: Date;
  note: string | null;
  setorNome: string;
  itens: ItemParaSeparar[];
  separados: number;
  total: number;
}

/** O pedido como o SEPARADOR o vê: só os itens do setor dele. */
export async function getPedidoParaSeparar(user: SessionUser, requestId: string): Promise<PedidoParaSeparar | null> {
  const { id: setor, vejoTudo } = await meuSetor(user);
  if (!setor && !vejoTudo) return null;

  const r = await prisma.productRequest.findUnique({
    where: { id: requestId },
    include: {
      requestItems: {
        where: setor ? { cdSectorId: setor } : undefined,
        orderBy: { name: 'asc' },
      },
    },
  });
  if (!r) return null;
  if (r.requestItems.length === 0) return null;

  const unit = await prisma.unit.findUnique({ where: { id: r.unitId }, select: { name: true } });
  const nomeDoSetor = r.requestItems[0].cdSectorName ?? 'Sem setor';

  const itens: ItemParaSeparar[] = r.requestItems.map((i) => {
    const pedido = Number(i.qtyRequested);
    const separado = i.qtySeparated === null ? null : Number(i.qtySeparated);
    return {
      id: i.id, name: i.name, category: i.category, measure: i.measure, packUnit: i.packUnit,
      qtyRequested: pedido, qtySeparated: separado,
      missingReason: i.missingReason, missingLabel: motivoLabel(i.missingReason),
      separadoPor: i.separatedByName, separadoEm: i.separatedAt,
      faltando: separado === null ? 0 : Math.max(0, Math.round((pedido - separado) * 1000) / 1000),
    };
  });

  return {
    id: r.id, number: r.number, unitName: unit?.name ?? '—', createdAt: r.createdAt, note: r.note,
    setorNome: nomeDoSetor, itens,
    separados: itens.filter((i) => i.qtySeparated !== null).length,
    total: itens.length,
  };
}

/**
 * O ROMANEIO pelo lado do CD — a folha inteira da carga.
 *
 * O defeito que esta função existe para consertar: a página do romaneio do CD
 * carregava o pedido por `getPedido`, que pede acesso à UNIDADE. O separador
 * não tem unidade nenhuma — desde a v1.92.0 ele é cadastrado por setor do CD,
 * porque o CD atende a rede toda —, então `canAccessUnit` recusava todos os
 * pedidos e "Romaneio para imprimir" dava **404 em cima de um pedido que a
 * pessoa tinha acabado de abrir**. Valia para todo separador e todo pedido.
 *
 * A porta aqui é EXATAMENTE a da tela de separação, e por construção: em vez de
 * escrever uma segunda regra equivalente — que envelheceria em separado e
 * traria o mesmo 404 de volta por outro caminho —, esta função pergunta a
 * `getPedidoParaSeparar`. Quem consegue abrir o pedido consegue imprimir o
 * romaneio dele, sempre.
 *
 * O conteúdo, porém, é a carga INTEIRA e não só o setor de quem imprime: é a
 * folha que sai junto com a mercadoria e é conferida na doca, onde a carga já
 * está reunida. O recorte por setor existe para ninguém separar a lista do
 * colega por engano — não para esconder o que vai no mesmo caminhão.
 */
export async function getRomaneioDoCd(user: SessionUser, requestId: string): Promise<PedidoDetalhado | null> {
  const meu = await getPedidoParaSeparar(user, requestId);
  if (!meu) return null;
  return carregarPedidoSemEscopoDeUnidade(requestId);
}
