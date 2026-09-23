import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyUsers, notifyUnitRole } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';
import { divergenciaLabel, ehDivergencia } from './entrega-tela';
import { numeroDoPedido } from './numero-do-pedido';

/**
 * A ÚLTIMA PERNA do pedido: o CD confirma o envio, a unidade confere o que
 * chegou.
 *
 * O que essa perna resolve é uma discussão velha por telefone — "mandei tudo"
 * contra "chegou faltando". Aqui as duas versões ficam gravadas lado a lado: o
 * que o CD **separou** (entrega 3) e o que a unidade **recebeu**. Quando os
 * dois números divergem, o pedido fecha como `CONCLUIDO_DIVERGENCIA` e o CD é
 * avisado — a divergência não fica só num caderno da unidade.
 *
 * Nada aqui edita a separação: o que o CD registrou continua como registrou.
 * A conferência é uma **segunda leitura**, não uma correção da primeira.
 */

export type ResultadoDaEntrega =
  | { ok: true; status: string }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NAO_ENCONTRADO' | 'FORA_DE_ORDEM'; detalhe?: string };

/**
 * O CD confirma que a carga saiu.
 *
 * Só de `PRONTO_ENVIO`: antes disso ainda há setor separando, e dar saída num
 * pedido incompleto faria a unidade conferir contra uma lista que ninguém
 * terminou. Quem confirma é quem separa (o setor não importa — a carga sai
 * inteira) ou ADMIN/CEO.
 */
export async function confirmarEnvio(
  user: SessionUser,
  requestId: string,
  cdNote: string | null,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoDaEntrega> {
  const pedido = await prisma.productRequest.findUnique({
    where: { id: requestId },
    select: { id: true, number: true, status: true, unitId: true, createdById: true, createdAt: true },
  });
  if (!pedido) return { ok: false, reason: 'NAO_ENCONTRADO' };

  if (pedido.status === 'ENVIADO_UNIDADE') {
    return { ok: false, reason: 'FORA_DE_ORDEM', detalhe: 'Este pedido já foi enviado para a unidade.' };
  }
  /* De "Separado" OU de "Conferido": a conferência da carga (v1.116.0) é
     etapa oferecida, não obrigatória — obrigar travaria quem já opera sem ela. */
  if (pedido.status !== 'PRONTO_ENVIO' && pedido.status !== 'CONFERIDO') {
    return { ok: false, reason: 'FORA_DE_ORDEM', detalhe: 'A separação ainda não terminou — só dá para enviar quando todos os setores concluírem.' };
  }

  await prisma.productRequest.update({
    where: { id: requestId },
    data: {
      status: 'ENVIADO_UNIDADE',
      sentById: user.id, sentByName: user.name, sentAt: new Date(),
      cdNote: cdNote?.trim() || null,
    },
  });

  /* Avisa a unidade INTEIRA, não só quem pediu: quem recebe a carga na porta
     quase nunca é quem digitou o pedido. */
  await notifyUnitRole(pedido.unitId, 'MANAGER', {
    title: '🚚 Seu pedido saiu do CD',
    body: `O ${numeroDoPedido(pedido.number, pedido.createdAt)} está a caminho. Confira ao receber.`,
    link: `/modulos/produtos/pedido/${pedido.id}`, module: 'PRODUCTS',
  }).catch(() => {});

  await audit({
    userId: user.id, unitId: pedido.unitId, action: 'PRODUCT_REQUEST_SENT', module: 'PRODUCTS',
    entity: 'product_request', entityId: requestId,
    metadata: { pedido: pedido.number, observacao_cd: cdNote?.trim() || null }, ...ctx,
  });

  return { ok: true, status: 'ENVIADO_UNIDADE' };
}

/**
 * A CONFERÊNCIA DA CARGA no CD — entre "Separado" e "Em trânsito".
 *
 * Alguém confere a carga reunida na doca contra o romaneio e marca. Depois
 * disso a separação trava (mexer num item depois de conferido invalidaria a
 * conferência em silêncio); o envio segue liberado. Só de `PRONTO_ENVIO`.
 */
export async function conferirCarga(
  user: SessionUser,
  requestId: string,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoDaEntrega> {
  const pedido = await prisma.productRequest.findUnique({
    where: { id: requestId },
    select: { id: true, number: true, status: true, unitId: true },
  });
  if (!pedido) return { ok: false, reason: 'NAO_ENCONTRADO' };
  if (pedido.status === 'CONFERIDO') return { ok: true, status: 'CONFERIDO' };
  if (pedido.status !== 'PRONTO_ENVIO') {
    return { ok: false, reason: 'FORA_DE_ORDEM', detalhe: pedido.status === 'ENVIADO_UNIDADE' || pedido.status.startsWith('CONCLUIDO')
      ? 'Este pedido já saiu do CD.'
      : 'A separação ainda não terminou — a carga só se confere depois que todos os setores concluírem.' };
  }
  await prisma.productRequest.update({
    where: { id: requestId },
    data: { status: 'CONFERIDO', checkedById: user.id, checkedByName: user.name, checkedAt: new Date() },
  });
  await audit({
    userId: user.id, unitId: pedido.unitId, action: 'PRODUCT_REQUEST_CHECKED', module: 'PRODUCTS',
    entity: 'product_request', entityId: requestId, metadata: { pedido: pedido.number }, ...ctx,
  });
  return { ok: true, status: 'CONFERIDO' };
}

export interface ConferenciaDeItem {
  itemId: string;
  /** Um dos ids de `DIVERGENCIAS`. Vazio = chegou como o CD separou. */
  issue?: string | null;
  note?: string | null;
  /** Caminho já salvo pelo `saveAttachment` — a rota sobe o arquivo. */
  photo?: string | null;
}

export interface ConferenciaDeRecebimento {
  itens: ConferenciaDeItem[];
  quality?: string | null;
  packaging?: string | null;
  note?: string | null;
  /**
   * A carga chegou completa? Declaração de quem recebeu na doca.
   *
   * Fica ao LADO do que o sistema calcula (faltas do CD + divergências
   * apontadas), não no lugar. As duas podem discordar — o CD marcou falta mas
   * mandou assim mesmo, ou veio item que ninguém apontou — e nessa hora a
   * palavra de quem conferiu é o registro que vale.
   */
  completo?: boolean | null;
}

/**
 * A unidade confere o que chegou.
 *
 * Fecha o pedido em `CONCLUIDO` ou `CONCLUIDO_DIVERGENCIA` — e a divergência
 * **não impede** fechar: obrigar a unidade a resolver antes de confirmar só
 * faria a conferência não acontecer, e o problema voltaria a viver no telefone.
 */
export async function conferirRecebimento(
  user: SessionUser,
  requestId: string,
  input: ConferenciaDeRecebimento,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoDaEntrega> {
  const pedido = await prisma.productRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true, number: true, status: true, unitId: true, sentById: true, createdAt: true,
      requestItems: { select: { id: true, name: true } },
    },
  });
  if (!pedido) return { ok: false, reason: 'NAO_ENCONTRADO' };
  if (!canAccessUnit(user, pedido.unitId)) return { ok: false, reason: 'FORBIDDEN' };

  if (pedido.status !== 'ENVIADO_UNIDADE') {
    return {
      ok: false, reason: 'FORA_DE_ORDEM',
      detalhe: pedido.status === 'CONCLUIDO' || pedido.status === 'CONCLUIDO_DIVERGENCIA'
        ? 'Este pedido já foi conferido.'
        : 'O CD ainda não confirmou o envio deste pedido.',
    };
  }

  /* Só aceita apontamento sobre item DESTE pedido — um id de fora viria de
     requisição forjada, e gravaria divergência no pedido de outra unidade. */
  const daCasa = new Map(pedido.requestItems.map((i) => [i.id, i.name]));
  const apontados = input.itens.filter((i) => i.issue || i.note || i.photo);
  for (const i of apontados) {
    if (!daCasa.has(i.itemId)) return { ok: false, reason: 'INVALID', detalhe: 'Item não pertence a este pedido.' };
    if (i.issue && !ehDivergencia(i.issue)) return { ok: false, reason: 'INVALID', detalhe: 'Motivo de divergência desconhecido.' };
  }

  const comProblema = apontados.filter((i) => i.issue);
  const status = comProblema.length > 0 ? 'CONCLUIDO_DIVERGENCIA' : 'CONCLUIDO';

  /* `ProductRequest` guarda o unitId sem relacao declarada — o nome vem a parte. */
  const unidade = await prisma.unit.findUnique({ where: { id: pedido.unitId }, select: { name: true } });

  await prisma.$transaction([
    /* Limpa a conferência anterior do pedido inteiro antes de gravar a nova:
       sem isso, um apontamento retirado na tela continuaria no banco. */
    prisma.productRequestItem.updateMany({
      where: { requestId },
      data: { receiptIssue: null, receiptNote: null, receiptPhoto: null },
    }),
    ...apontados.map((i) => prisma.productRequestItem.update({
      where: { id: i.itemId },
      data: {
        receiptIssue: i.issue?.trim() || null,
        receiptNote: i.note?.trim() || null,
        receiptPhoto: i.photo || null,
      },
    })),
    prisma.productRequest.update({
      where: { id: requestId },
      data: {
        status,
        receivedById: user.id, receivedByName: user.name, receivedAt: new Date(),
        receiptQuality: input.quality?.trim() || null,
        receiptPackaging: input.packaging?.trim() || null,
        receiptNote: input.note?.trim() || null,
        receiptComplete: input.completo ?? null,
      },
    }),
  ]);

  /* O CD é avisado NOS DOIS casos, e quem recebe o aviso é quem deu saída na
     carga — é quem consegue olhar a doca e responder.
     O "recebido sem divergência" também vale aviso: para o CD, o pedido só
     termina quando alguém do outro lado confirma que chegou. Sem esse retorno,
     a carga fica em aberto na cabeça de quem despachou, e a checagem volta a
     ser por telefone — que é o que este módulo veio encerrar. */
  if (pedido.sentById) {
    const etiqueta = numeroDoPedido(pedido.number, pedido.createdAt);
    if (comProblema.length > 0) {
      const lista = comProblema
        .slice(0, 3)
        .map((i) => `${daCasa.get(i.itemId)} (${divergenciaLabel(i.issue ?? null)})`)
        .join(', ');
      const resto = comProblema.length > 3 ? ` e mais ${comProblema.length - 3}` : '';
      await notifyUsers([pedido.sentById], {
        title: '⚠️ Recebimento com divergência',
        body: `${etiqueta}: ${lista}${resto}.`,
        link: `/modulos/separacao/${pedido.id}`, module: 'PRODUCTS',
      }).catch(() => {});
    } else {
      await notifyUsers([pedido.sentById], {
        title: '✓ Pedido recebido',
        body: `${unidade?.name ?? 'A unidade'} confirmou o recebimento do ${etiqueta}, sem divergência.`,
        link: `/modulos/separacao/${pedido.id}`, module: 'PRODUCTS',
      }).catch(() => {});
    }
  }

  await audit({
    userId: user.id, unitId: pedido.unitId, action: 'PRODUCT_REQUEST_RECEIVED', module: 'PRODUCTS',
    entity: 'product_request', entityId: requestId,
    metadata: {
      pedido: pedido.number, status,
      divergencias: comProblema.map((i) => ({ item: daCasa.get(i.itemId), motivo: divergenciaLabel(i.issue ?? null) })),
      qualidade: input.quality ?? null, embalagem: input.packaging ?? null, completo: input.completo ?? null,
    }, ...ctx,
  });

  return { ok: true, status };
}

/**
 * Os itens de um pedido antigo, prontos para montar outro igual.
 *
 * Todo mês a unidade pede quase a mesma coisa; redigitar trinta linhas é o que
 * faz o pedido sair errado ou atrasado. Só entram produtos que **ainda existem
 * e estão ativos** — trazer um produto desativado devolveria ao gerente um
 * pedido que o CD não consegue atender.
 */
export async function itensParaRepetir(
  user: SessionUser,
  requestId: string,
): Promise<{ ok: true; itens: { productId: string; qty: number }[]; ignorados: string[] } | { ok: false; reason: 'FORBIDDEN' | 'NAO_ENCONTRADO' }> {
  const pedido = await prisma.productRequest.findUnique({
    where: { id: requestId },
    select: { unitId: true, requestItems: { select: { productId: true, name: true, qtyRequested: true } } },
  });
  if (!pedido) return { ok: false, reason: 'NAO_ENCONTRADO' };
  if (!canAccessUnit(user, pedido.unitId)) return { ok: false, reason: 'FORBIDDEN' };

  const ids = pedido.requestItems.map((i) => i.productId).filter((v): v is string => !!v);
  const vivos = new Set(
    (await prisma.product.findMany({ where: { id: { in: ids }, active: true }, select: { id: true } })).map((p) => p.id),
  );

  const itens: { productId: string; qty: number }[] = [];
  const ignorados: string[] = [];
  for (const i of pedido.requestItems) {
    if (i.productId && vivos.has(i.productId)) itens.push({ productId: i.productId, qty: Number(i.qtyRequested) });
    else ignorados.push(i.name);
  }
  return { ok: true, itens, ignorados };
}
