import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { ORIGENS_PEDIVEIS } from '@/lib/products';
import { unidadeValida, type UnidadeDePedido } from '@/lib/products/embalagem-pedido';
import { audit } from '@/lib/audit';
import { notifyAdmins, notifyUsers } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';
import type { ProductOrigin } from '@prisma/client';

/**
 * PEDIDOS INTERNOS — a base (entrega 1 de 4).
 *
 * O que existia: um pedido por origem, com os itens dentro de um campo JSON e o
 * status numa string livre. Não havia setor do CD, separação por item nem
 * perfil de separador.
 *
 * O que mudou de estrutural: **o item virou linha**. É o que permite quatro
 * setores trabalharem no mesmo pedido ao mesmo tempo — com os itens num JSON
 * único, duas confirmações simultâneas sobrescreviam uma à outra em silêncio, e
 * o trabalho de alguém sumia sem erro nenhum.
 */

export const STATUS_PEDIDO = {
  RASCUNHO: 'Rascunho',
  ENVIADO_CD: 'Enviado ao CD',
  SEPARANDO: 'Separação em andamento',
  PRONTO_ENVIO: 'Pronto para envio',
  ENVIADO_UNIDADE: 'Enviado para a unidade',
  CONCLUIDO: 'Concluído',
  CONCLUIDO_DIVERGENCIA: 'Concluído com divergência',
  CANCELADO: 'Cancelado',
} as const;

export type StatusPedido = keyof typeof STATUS_PEDIDO;

/** Situação de um setor dentro do pedido. */
export type StatusDoSetor = 'AGUARDANDO' | 'SEPARANDO' | 'CONCLUIDO' | 'CONCLUIDO_COM_FALTA';

export const STATUS_SETOR_LABEL: Record<StatusDoSetor, string> = {
  AGUARDANDO: 'Aguardando',
  SEPARANDO: 'Em separação',
  CONCLUIDO: 'Concluído',
  CONCLUIDO_COM_FALTA: 'Concluído com falta',
};

export interface ItemDoPedido {
  productId: string;
  qty: number;
  /** Como o gerente pediu: 2 FARDOS, 3 DISPLAYS. Registro, não conversão. */
  packUnit?: UnidadeDePedido;
}

export type ResultadoDePedido<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NAO_ENCONTRADO'; detalhe?: string };

/**
 * Cria o pedido com os itens em LINHA, cada um carregando o setor do CD.
 *
 * O gerente faz **um** pedido e não escolhe setor nenhum: o produto já sabe a
 * qual setor pertence, e a divisão acontece aqui. Produto sem setor cadastrado
 * não trava o pedido — ele entra sem setor e aparece num balde à parte, porque
 * recusar o pedido inteiro por causa de um cadastro incompleto puniria a
 * unidade por um problema do CD.
 */
export async function criarPedido(
  user: SessionUser,
  input: { unitId: string; items: ItemDoPedido[]; note?: string },
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<ResultadoDePedido<{ pedidos: { id: string; number: number; origin: ProductOrigin }[]; semSetor: number }>> {
  if (!canAccessUnit(user, input.unitId)) return { ok: false, reason: 'FORBIDDEN' };

  const limpos = input.items.filter((i) => i.productId && i.qty > 0);
  if (limpos.length === 0) return { ok: false, reason: 'INVALID', detalhe: 'O pedido está vazio.' };

  /* SÓ o que tem esteira de pedido. `LOCAL` (Estoque, v1.105.0) é compra direta
     da unidade: não há quem separe e não há para onde enviar. Filtrar AQUI, e
     não só na tela, é o que garante que ela não entre por uma chamada direta —
     um item local viraria um `ProductRequest` de origem que nenhuma aba trata e
     que ninguém veria. */
  const produtos = await prisma.product.findMany({
    where: { id: { in: limpos.map((i) => i.productId) }, active: true, origin: { in: ORIGENS_PEDIVEIS } },
    select: { id: true, name: true, category: true, measure: true, origin: true, cdSectorId: true, cdSector: { select: { name: true } } },
  });
  if (produtos.length === 0) return { ok: false, reason: 'INVALID', detalhe: 'Nenhum produto válido no pedido.' };

  /* DIVISÃO POR DESTINO — um pedido para a Fábrica, outro para o CD.
     O gerente monta UM carrinho e não escolhe destino nenhum: o produto já sabe
     de onde vem. Antes, o pedido inteiro herdava a origem do PRIMEIRO produto
     (`input.origin ?? produtos[0].origin`), então um carrinho misto virava um
     pedido só, carimbado "Fábrica" e enviado ao CD — cada lado via item que não
     era dele, e o número do pedido não dizia para onde ia. */
  const porOrigem = new Map<ProductOrigin, ItemDoPedido[]>();
  for (const i of limpos) {
    const p = produtos.find((x) => x.id === i.productId);
    if (!p) continue;
    porOrigem.set(p.origin, [...(porOrigem.get(p.origin) ?? []), i]);
  }
  if (porOrigem.size === 0) return { ok: false, reason: 'INVALID', detalhe: 'Nenhum produto válido no pedido.' };

  const unit = await prisma.unit.findUnique({ where: { id: input.unitId }, select: { name: true } });
  const semSetor = produtos.filter((p) => p.origin === 'CD' && !p.cdSectorId).length;
  const criados: { id: string; number: number; origin: ProductOrigin }[] = [];

  /* A Fábrica não passa pela separação por setor do CD: ela tem o fluxo da aba
     Fábrica/CD (Novo → Em separação → Enviado → Recebido). Nascer `ENVIADO_CD`
     a colocaria numa esteira que não é dela. */
  const statusInicial = (o: ProductOrigin) => (o === 'CD' ? 'ENVIADO_CD' : 'NEW');

  for (const [origem, itensDaOrigem] of porOrigem) {
    /* Número sequencial por unidade, com retry: dois gerentes enviando ao mesmo
       tempo colidiriam no número, e o segundo perderia o pedido. */
    let criado: { id: string; number: number } | null = null;
    for (let tentativa = 0; tentativa < 5 && !criado; tentativa++) {
      const ultimo = await prisma.productRequest.findFirst({
        where: { unitId: input.unitId }, orderBy: { number: 'desc' }, select: { number: true },
      });
      const number = (ultimo?.number ?? 0) + 1;
      try {
        const r = await prisma.productRequest.create({
          data: {
            unitId: input.unitId, origin: origem, number, status: statusInicial(origem),
            createdById: user.id, createdByName: user.name,
            note: input.note?.trim() || null,
            /* O JSON legado continua sendo gravado: telas antigas ainda o leem, e
               desligar os dois lados na mesma entrega é como se perde o histórico. */
            items: itensDaOrigem.map((i) => {
              const p = produtos.find((x) => x.id === i.productId);
              return { productId: i.productId, name: p?.name ?? '', category: p?.category ?? '', measure: p?.measure ?? '', qty: i.qty, packUnit: unidadeValida(i.packUnit) };
            }) as unknown as Prisma.InputJsonValue,
            requestItems: {
              create: itensDaOrigem.flatMap((i) => {
                const p = produtos.find((x) => x.id === i.productId);
                if (!p) return [];
                return [{
                  productId: p.id, name: p.name, category: p.category, measure: p.measure,
                  cdSectorId: p.cdSectorId, cdSectorName: p.cdSector?.name ?? null,
                  /* A unidade de embalagem é do PEDIDO, e não do cadastro: o
                     SGO não converte para unidades nem consulta quantas vêm
                     dentro. Quem separa lê "2 fardos" e separa 2 fardos. */
                  packUnit: unidadeValida(i.packUnit),
                  qtyRequested: new Prisma.Decimal(Math.round(i.qty * 1000) / 1000),
                }];
              }),
            },
          },
          select: { id: true, number: true },
        });
        criado = r;
      } catch (e) {
        if ((e as { code?: string }).code === 'P2002') continue;
        throw e;
      }
    }
    if (!criado) return { ok: false, reason: 'INVALID', detalhe: 'Não foi possível gerar o número do pedido.' };
    criados.push({ ...criado, origin: origem });

    await audit({
      userId: user.id, unitId: input.unitId, action: 'PRODUCT_REQUEST_CREATE', module: 'PRODUCTS',
      entity: 'product_request', entityId: criado.id,
      metadata: { numero: criado.number, itens: itensDaOrigem.length, origem, semSetor: origem === 'CD' ? semSetor : 0 }, ...ctx,
    });
  }

  /* Avisa SÓ os separadores dos setores que têm item no pedido DO CD — quem não
     tem nada a separar não precisa receber nada, e a Fábrica não tem setor. */
  const pedidoDoCd = criados.find((c) => c.origin === 'CD');
  const setores = [...new Set(produtos.filter((p) => p.origin === 'CD').map((p) => p.cdSectorId).filter((x): x is string => Boolean(x)))];
  if (pedidoDoCd && setores.length > 0) {
    const separadores = await prisma.user.findMany({
      where: { active: true, role: 'SEPARATOR', cdSectorId: { in: setores } },
      select: { id: true },
    });
    if (separadores.length > 0) {
      await notifyUsers(separadores.map((s) => s.id), {
        title: '📦 Novo pedido para separação',
        body: `${unit?.name ?? 'Unidade'} enviou o pedido nº ${pedidoDoCd.number}.`,
        link: '/modulos/separacao',
        module: 'PRODUCTS',
      }).catch(() => {});
    }
  }

  /* O pedido da Fábrica não tem separador para avisar: quem o atende é a
     Fábrica/CD, pela aba de mesmo nome. */
  const pedidoDaFabrica = criados.find((c) => c.origin === 'FABRICA');
  if (pedidoDaFabrica) {
    await notifyAdmins({
      title: '🏭 Novo pedido à Fábrica',
      body: `${unit?.name ?? 'Unidade'} enviou o pedido nº ${pedidoDaFabrica.number}.`,
      link: '/modulos/produtos',
      module: 'PRODUCTS',
    }).catch(() => {});
  }

  return { ok: true, pedidos: criados, semSetor };
}

export interface ItemNaTela {
  id: string;
  name: string;
  category: string;
  measure: string;
  /** Como o gerente pediu — "2 fardos". Registro, nunca conversao. */
  packUnit: UnidadeDePedido;
  cdSectorId: string | null;
  cdSectorName: string | null;
  qtyRequested: number;
  qtySeparated: number | null;
  missingReason: string | null;
  separadoPor: string | null;
  separadoEm: Date | null;
}

export interface SetorDoPedido {
  cdSectorId: string | null;
  cdSectorName: string;
  itens: ItemNaTela[];
  separados: number;
  total: number;
  status: StatusDoSetor;
}

export interface PedidoDetalhado {
  id: string;
  number: number;
  unitId: string;
  unitName: string;
  status: StatusPedido;
  statusLabel: string;
  createdAt: Date;
  createdByName: string;
  note: string | null;
  cdNote: string | null;
  sentByName: string | null;
  sentAt: Date | null;
  receivedByName: string | null;
  receivedAt: Date | null;
  setores: SetorDoPedido[];
  totalItens: number;
  totalSeparados: number;
}

/** Como está cada setor dentro do pedido. */
function statusDoSetor(itens: ItemNaTela[]): StatusDoSetor {
  const tocados = itens.filter((i) => i.qtySeparated !== null);
  if (tocados.length === 0) return 'AGUARDANDO';
  if (tocados.length < itens.length) return 'SEPARANDO';
  /* Concluído COM FALTA quando alguma linha saiu com menos do que foi pedido —
     a falta não impede concluir o setor, mas não pode sumir do rótulo. */
  return itens.some((i) => (i.qtySeparated ?? 0) < i.qtyRequested) ? 'CONCLUIDO_COM_FALTA' : 'CONCLUIDO';
}

const num = (d: Prisma.Decimal | null) => (d === null ? null : Number(d));

/**
 * O pedido inteiro, já dividido por setor do CD — pela porta da UNIDADE.
 *
 * Esta é a porta de quem pede: gerente, supervisão, administração. Quem entra
 * pelo lado do CD **não passa por aqui**, porque o separador não tem unidade
 * nenhuma (o CD atende a rede toda, v1.92.0) e `canAccessUnit` recusaria todos
 * os pedidos. Para esse lado existe `carregarPedidoSemEscopoDeUnidade`, usada
 * atrás da porta do setor em `separacao.ts`.
 */
export async function getPedido(user: SessionUser, id: string): Promise<PedidoDetalhado | null> {
  const r = await prisma.productRequest.findUnique({ where: { id }, select: { unitId: true } });
  if (!r) return null;
  if (!canAccessUnit(user, r.unitId)) return null;
  return carregarPedidoSemEscopoDeUnidade(id);
}

/**
 * O MESMO pedido, sem checar unidade.
 *
 * ⚠️ Não chame direto de uma tela. Ela não decide acesso nenhum — só monta. Quem
 * a usa precisa TER DECIDIDO o acesso por outra porta, e hoje existe uma só:
 * a do CD, em `separacao.ts`, onde o direito vem do setor da pessoa e não da
 * unidade. O nome é longo de propósito.
 */
export async function carregarPedidoSemEscopoDeUnidade(id: string): Promise<PedidoDetalhado | null> {
  const r = await prisma.productRequest.findUnique({
    where: { id },
    include: {
      requestItems: { orderBy: [{ cdSectorName: 'asc' }, { name: 'asc' }] },
    },
  });
  if (!r) return null;
  const unit = await prisma.unit.findUnique({ where: { id: r.unitId }, select: { name: true } });

  const porSetor = new Map<string, ItemNaTela[]>();
  for (const i of r.requestItems) {
    /* Produto sem setor cadastrado cai num balde próprio em vez de sumir: é
       erro de cadastro do CD, e esconder faria o item não ser separado por
       ninguém. */
    const chave = i.cdSectorId ?? '__sem_setor__';
    const lista = porSetor.get(chave) ?? [];
    lista.push({
      id: i.id, name: i.name, category: i.category, measure: i.measure, packUnit: i.packUnit,
      cdSectorId: i.cdSectorId, cdSectorName: i.cdSectorName,
      qtyRequested: Number(i.qtyRequested),
      qtySeparated: num(i.qtySeparated),
      missingReason: i.missingReason,
      separadoPor: i.separatedByName,
      separadoEm: i.separatedAt,
    });
    porSetor.set(chave, lista);
  }

  const setores: SetorDoPedido[] = [...porSetor.entries()].map(([chave, itens]) => ({
    cdSectorId: chave === '__sem_setor__' ? null : chave,
    cdSectorName: chave === '__sem_setor__' ? 'Sem setor cadastrado' : (itens[0].cdSectorName ?? 'Setor'),
    itens,
    separados: itens.filter((i) => i.qtySeparated !== null).length,
    total: itens.length,
    status: statusDoSetor(itens),
  })).sort((a, b) => a.cdSectorName.localeCompare(b.cdSectorName, 'pt-BR'));

  const totalItens = r.requestItems.length;
  const totalSeparados = r.requestItems.filter((i) => i.qtySeparated !== null).length;
  const status = (r.status as StatusPedido) in STATUS_PEDIDO ? (r.status as StatusPedido) : 'ENVIADO_CD';

  return {
    id: r.id, number: r.number, unitId: r.unitId, unitName: unit?.name ?? '—',
    status, statusLabel: STATUS_PEDIDO[status],
    createdAt: r.createdAt, createdByName: r.createdByName,
    note: r.note, cdNote: r.cdNote,
    sentByName: r.sentByName, sentAt: r.sentAt,
    receivedByName: r.receivedByName, receivedAt: r.receivedAt,
    setores, totalItens, totalSeparados,
  };
}

/** Os pedidos de uma unidade, do mais recente para o mais antigo. */
export async function listarPedidosDaUnidade(user: SessionUser, unitId: string, take = 40) {
  if (!canAccessUnit(user, unitId)) return [];
  const rs = await prisma.productRequest.findMany({
    where: { unitId }, orderBy: { createdAt: 'desc' }, take,
    /* Os itens vêm só com `qtySeparated` para contar o progresso — "12 de 20
       separados" é o que o gerente quer saber ao abrir a tela, e sem isso o
       cartão do pedido em andamento não teria o que mostrar. */
    include: { requestItems: { select: { qtySeparated: true } } },
  });
  return rs.map((r) => {
    const status = (r.status as StatusPedido) in STATUS_PEDIDO ? (r.status as StatusPedido) : 'ENVIADO_CD';
    return {
      id: r.id, number: r.number, status, statusLabel: STATUS_PEDIDO[status],
      createdAt: r.createdAt, createdByName: r.createdByName,
      itens: r.requestItems.length,
      separados: r.requestItems.filter((i) => i.qtySeparated !== null).length,
      /* Ainda em curso: é o pedido que merece o cartão em destaque. Concluído e
         cancelado saem do topo e viram histórico. */
      emAndamento: ['ENVIADO_CD', 'SEPARANDO', 'PRONTO_ENVIO', 'ENVIADO_UNIDADE'].includes(status),
    };
  });
}

export interface FiltroDoHistorico {
  unitId?: string;
  /** Texto livre casado contra o NOME do produto congelado no item. */
  produto?: string;
  de?: Date;
  ate?: Date;
  status?: string;
  gerente?: string;
}

/**
 * O HISTÓRICO de pedidos, com filtros.
 *
 * Responde a perguntas que a lista dos últimos pedidos não responde: "quando
 * foi a última vez que pedimos muçarela?", "quantos pedidos fecharam com
 * divergência este mês?", "o que a Moreira pediu em agosto?".
 *
 * O filtro por produto casa o **nome congelado no item**, não o id do produto:
 * é o que faz o pedido antigo continuar encontrável depois de o produto ser
 * renomeado ou excluído do catálogo.
 */
export async function historicoDePedidos(user: SessionUser, f: FiltroDoHistorico, take = 200) {
  /* Escopo no servidor: sem unidade escolhida, valem as que a pessoa enxerga. */
  const unidades = f.unitId
    ? (canAccessUnit(user, f.unitId) ? [f.unitId] : [])
    : (user.seesAllUnits ? null : user.unitIds);
  if (unidades && unidades.length === 0) return { pedidos: [], unidades: new Map<string, string>() };

  const rs = await prisma.productRequest.findMany({
    where: {
      ...(unidades ? { unitId: { in: unidades } } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(f.gerente ? { createdByName: { contains: f.gerente, mode: 'insensitive' } } : {}),
      ...(f.de || f.ate ? { createdAt: { ...(f.de ? { gte: f.de } : {}), ...(f.ate ? { lte: f.ate } : {}) } } : {}),
      ...(f.produto ? { requestItems: { some: { name: { contains: f.produto, mode: 'insensitive' } } } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take,
    include: { requestItems: { select: { qtySeparated: true, receiptIssue: true } } },
  });

  const nomes = new Map(
    (await prisma.unit.findMany({
      where: { id: { in: [...new Set(rs.map((r) => r.unitId))] } },
      select: { id: true, name: true },
    })).map((u) => [u.id, u.name]),
  );

  return {
    unidades: nomes,
    pedidos: rs.map((r) => {
      const status = (r.status as StatusPedido) in STATUS_PEDIDO ? (r.status as StatusPedido) : 'ENVIADO_CD';
      return {
        id: r.id, number: r.number, status, statusLabel: STATUS_PEDIDO[status],
        unitId: r.unitId, unitName: nomes.get(r.unitId) ?? '—',
        createdAt: r.createdAt, createdByName: r.createdByName,
        itens: r.requestItems.length,
        separados: r.requestItems.filter((i) => i.qtySeparated !== null).length,
        divergencias: r.requestItems.filter((i) => i.receiptIssue !== null).length,
      };
    }),
  };
}

/**
 * O que o SEPARADOR vê: só os itens do setor dele.
 *
 * O setor vem do cadastro do usuário, nunca de um seletor na tela — foi o
 * pedido explícito, e é o que impede alguém separar a lista do colega por
 * engano.
 */
export async function listarParaSeparacao(user: SessionUser) {
  const eu = await prisma.user.findUnique({ where: { id: user.id }, select: { cdSectorId: true, cdSector: { select: { name: true } } } });
  const meuSetor = eu?.cdSectorId ?? null;
  /* ADMIN/CEO enxergam tudo — é como acompanham o CD sem ter setor próprio. */
  const vejoTudo = user.role === 'ADMIN' || user.role === 'CEO';
  if (!meuSetor && !vejoTudo) return { setorId: null, setorNome: null, pedidos: [] };

  const pedidos = await prisma.productRequest.findMany({
    where: {
      status: { in: ['ENVIADO_CD', 'SEPARANDO', 'PRONTO_ENVIO'] },
      ...(meuSetor ? { requestItems: { some: { cdSectorId: meuSetor } } } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
    include: { requestItems: meuSetor ? { where: { cdSectorId: meuSetor } } : true },
  });

  /* `ProductRequest` guarda o unitId sem relação declarada (é denormalizado de
     origem), então o nome da unidade vem numa consulta à parte — uma só, e não
     uma por pedido. */
  const unidades = new Map(
    (await prisma.unit.findMany({
      where: { id: { in: [...new Set(pedidos.map((p) => p.unitId))] } },
      select: { id: true, name: true },
    })).map((u) => [u.id, u.name]),
  );

  return {
    setorId: meuSetor,
    setorNome: eu?.cdSector?.name ?? null,
    pedidos: pedidos.map((p) => {
      const total = p.requestItems.length;
      const separados = p.requestItems.filter((i) => i.qtySeparated !== null).length;
      return {
        id: p.id, number: p.number, unitName: unidades.get(p.unitId) ?? '—', createdAt: p.createdAt,
        total, separados,
        status: separados === 0 ? 'AGUARDANDO' : separados < total ? 'SEPARANDO' : 'CONCLUIDO',
      };
    }),
  };
}
