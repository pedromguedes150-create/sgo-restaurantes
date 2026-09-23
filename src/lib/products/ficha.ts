import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { normalizarCodigoDeBarras } from '@/lib/products/sheet';
import { propagarSetorParaItensAbertos } from '@/lib/products/propagar-setor';
import type { SessionUser } from '@/lib/auth/session';
import type { PackType, ProductOrigin } from '@prisma/client';

/**
 * A FICHA DO PRODUTO — a ferramenta de manter o catálogo.
 *
 * O catálogo tinha uma linha por produto e nada para abrir: corrigir um
 * código vinculado errado era apagar o produto. A ficha abre o produto
 * inteiro e, sobretudo, os CÓDIGOS: listar, adicionar, remover e TRANSFERIR
 * para outro produto — com histórico (`ProductBarcodeChange`: código, de
 * quem, para quem, quem mexeu, quando, motivo).
 *
 * Duas regras que atravessam tudo aqui:
 *  - Pedidos já gravados NÃO mudam: `ProductRequestItem` guarda nome e setor
 *    como retrato do dia. Corrigir o catálogo vale para os próximos pedidos.
 *  - Nada muda calado: toda alteração da ficha vai para a Auditoria com o
 *    ANTES e o DEPOIS de cada campo tocado.
 */

type Ctx = { ip?: string | null; userAgent?: string | null };

/** Quem mantém o catálogo: Administração, Supervisão e Coordenação (decisão do Pedro, 23/09/2026). */
export const podeGerirCatalogo = (user: SessionUser) => ['ADMIN', 'CEO', 'SUPERVISOR', 'COORDINATOR'].includes(user.role);

export interface CodigoDaFicha {
  id: string;
  code: string;
  principal: boolean;
  createdAt: string;
  createdByName: string | null;
  /** null = veio do pedido e ninguém do catálogo olhou ainda. */
  reviewedAt: string | null;
}

export interface MudancaDeCodigo {
  id: string;
  code: string;
  action: string;
  fromProductName: string | null;
  toProductName: string | null;
  userName: string;
  reason: string | null;
  createdAt: string;
}

export interface FichaDoProduto {
  id: string;
  name: string;
  origin: ProductOrigin;
  category: string;
  measure: string;
  packType: PackType;
  packSize: number | null;
  cdSectorId: string | null;
  cdSectorName: string | null;
  active: boolean;
  validation: string;
  createdByName: string | null;
  validatedAt: string | null;
  codigos: CodigoDaFicha[];
  historico: MudancaDeCodigo[];
  /** Em quantos pedidos em curso este produto aparece — o que a correção NÃO altera. */
  emPedidosAbertos: number;
}

export type FichaResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; reason: 'FORBIDDEN' | 'NAO_ENCONTRADO' | 'INVALID' | 'JA_USADO' | 'SEM_SETOR'; message?: string };

const MEDIDAS = ['un', 'kg', 'g', 'L', 'ml', 'cx', 'pct', 'dz', 'fardo', 'caixa'];
const TIPOS: PackType[] = ['UN', 'FARDO', 'DISPLAY'];
const ORIGENS: ProductOrigin[] = ['FABRICA', 'CD', 'LOCAL'];

export async function getFicha(user: SessionUser, id: string): Promise<FichaDoProduto | null> {
  if (!podeGerirCatalogo(user)) return null;
  const p = await prisma.product.findUnique({
    where: { id },
    include: {
      cdSector: { select: { name: true } },
      barcodes: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!p) return null;
  /* `ProductBarcode.createdById` não tem FK (a coluna é anterior a este
     histórico): o nome sai por consulta à parte, e um id de usuário já
     excluído vira só "—" em vez de derrubar a ficha. */
  const autores = [...new Set(p.barcodes.map((b) => b.createdById).filter((x): x is string => Boolean(x)))];
  const [historico, emPedidosAbertos, usuarios] = await Promise.all([
    prisma.productBarcodeChange.findMany({
      where: { OR: [{ fromProductId: id }, { toProductId: id }] },
      orderBy: { createdAt: 'desc' }, take: 50,
    }),
    prisma.productRequestItem.count({ where: { productId: id, request: { status: { in: ['ENVIADO_CD', 'SEPARANDO', 'PRONTO_ENVIO', 'NEW', 'SEPARATING'] } } } }),
    autores.length ? prisma.user.findMany({ where: { id: { in: autores } }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const nomePorId = new Map(usuarios.map((u) => [u.id, u.name]));
  return {
    id: p.id, name: p.name, origin: p.origin, category: p.category, measure: p.measure,
    packType: p.packType, packSize: p.packSize, cdSectorId: p.cdSectorId, cdSectorName: p.cdSector?.name ?? null,
    active: p.active, validation: p.validation, createdByName: p.createdByName, validatedAt: p.validatedAt?.toISOString() ?? null,
    codigos: p.barcodes.map((b) => ({
      id: b.id, code: b.code, principal: b.code === p.barcode, createdAt: b.createdAt.toISOString(),
      createdByName: b.createdById ? nomePorId.get(b.createdById) ?? null : null, reviewedAt: b.reviewedAt?.toISOString() ?? null,
    })),
    historico: historico.map((h) => ({
      id: h.id, code: h.code, action: h.action, fromProductName: h.fromProductName, toProductName: h.toProductName,
      userName: h.userName, reason: h.reason, createdAt: h.createdAt.toISOString(),
    })),
    emPedidosAbertos,
  };
}

/* ─────────────────────────── dados principais ─────────────────────────── */

export interface PatchDaFicha {
  name?: string;
  category?: string;
  measure?: string;
  origin?: string;
  cdSectorId?: string | null;
  packType?: string;
  packSize?: number | null;
  active?: boolean;
}

/**
 * Atualiza os dados principais e as embalagens, auditando só o que mudou.
 * Produto do CD VALIDADO não fica sem setor; o provisório pode (é o estado
 * dele até a validação). Fábrica e local não têm setor — limpa.
 */
export async function atualizarProduto(user: SessionUser, id: string, patch: PatchDaFicha, ctx: Ctx = {}): Promise<FichaResult> {
  if (!podeGerirCatalogo(user)) return { ok: false, reason: 'FORBIDDEN' };
  const atual = await prisma.product.findUnique({ where: { id }, include: { cdSector: { select: { name: true } } } });
  if (!atual) return { ok: false, reason: 'NAO_ENCONTRADO' };

  const data: Record<string, unknown> = {};
  const antes: Record<string, unknown> = {};
  const depois: Record<string, unknown> = {};
  const toca = (campo: string, de: unknown, para: unknown) => { if (de !== para) { data[campo] = para; antes[campo] = de; depois[campo] = para; } };

  if (patch.name !== undefined) {
    const n = patch.name.trim().slice(0, 120);
    if (n.length < 3) return { ok: false, reason: 'INVALID', message: 'Nome muito curto.' };
    toca('name', atual.name, n);
  }
  if (patch.category !== undefined) toca('category', atual.category, patch.category.trim() || 'Geral');
  if (patch.measure !== undefined) {
    if (!MEDIDAS.includes(patch.measure)) return { ok: false, reason: 'INVALID', message: 'Medida inválida.' };
    toca('measure', atual.measure, patch.measure);
  }
  const origem = patch.origin !== undefined ? (ORIGENS.includes(patch.origin as ProductOrigin) ? (patch.origin as ProductOrigin) : null) : atual.origin;
  if (!origem) return { ok: false, reason: 'INVALID', message: 'Origem inválida.' };
  toca('origin', atual.origin, origem);

  /* Setor: só produto do CD tem. Trocar a origem para Fábrica/local LIMPA o
     setor em vez de deixar dado órfão. */
  let setorId: string | null = patch.cdSectorId !== undefined ? (patch.cdSectorId || null) : atual.cdSectorId;
  let setorNome: string | null = atual.cdSector?.name ?? null;
  if (origem !== 'CD') setorId = null;
  if (setorId && setorId !== atual.cdSectorId) {
    const s = await prisma.cdSector.findFirst({ where: { id: setorId, active: true }, select: { name: true } });
    if (!s) return { ok: false, reason: 'INVALID', message: 'Setor do CD inválido ou inativo.' };
    setorNome = s.name;
  }
  if (origem === 'CD' && !setorId && atual.validation === 'VALIDADO') return { ok: false, reason: 'SEM_SETOR' };
  if (setorId !== atual.cdSectorId) {
    data.cdSectorId = setorId;
    antes.setor = atual.cdSector?.name ?? null;
    depois.setor = setorId ? setorNome : null;
  }

  const packType = patch.packType !== undefined ? (TIPOS.includes(patch.packType as PackType) ? (patch.packType as PackType) : null) : atual.packType;
  if (!packType) return { ok: false, reason: 'INVALID', message: 'Embalagem inválida.' };
  const packSize = patch.packSize !== undefined ? (patch.packSize && patch.packSize > 0 ? Math.trunc(patch.packSize) : null) : atual.packSize;
  if (packType !== 'UN' && !(packSize && packSize > 1)) return { ok: false, reason: 'INVALID', message: 'Informe quantas unidades vêm no fardo/display.' };
  toca('packType', atual.packType, packType);
  toca('packSize', atual.packSize, packType === 'UN' ? packSize : packSize);
  if (patch.active !== undefined) toca('active', atual.active, Boolean(patch.active));

  if (Object.keys(data).length === 0) return { ok: true };
  await prisma.product.update({ where: { id }, data });
  await audit({
    userId: user.id, action: 'PRODUCT_UPDATE', module: 'PRODUCTS', entity: 'product', entityId: id,
    metadata: { nome: atual.name, antes, depois }, ...ctx,
  });
  if (data.cdSectorId) await propagarSetorParaItensAbertos([id], ctx).catch(() => {});
  return { ok: true };
}

/* ─────────────────────────── códigos ─────────────────────────── */

async function donoDoCodigo(code: string) {
  return prisma.product.findFirst({
    where: { OR: [{ barcode: code }, { barcodes: { some: { code } } }] },
    select: { id: true, name: true, barcode: true },
  });
}

async function registrarMudanca(p: { code: string; action: 'ADD' | 'REMOVE' | 'TRANSFER'; from?: { id: string; name: string } | null; to?: { id: string; name: string } | null; user: SessionUser; reason?: string | null }) {
  await prisma.productBarcodeChange.create({
    data: {
      code: p.code, action: p.action,
      fromProductId: p.from?.id ?? null, fromProductName: p.from?.name ?? null,
      toProductId: p.to?.id ?? null, toProductName: p.to?.name ?? null,
      userId: p.user.id, userName: p.user.name, reason: p.reason?.trim() || null,
    },
  });
}

export async function adicionarCodigo(user: SessionUser, productId: string, codigoBruto: string, opts: { principal?: boolean } = {}, ctx: Ctx = {}): Promise<FichaResult> {
  if (!podeGerirCatalogo(user)) return { ok: false, reason: 'FORBIDDEN' };
  const code = normalizarCodigoDeBarras(codigoBruto);
  if (!code || code.length < 6) return { ok: false, reason: 'INVALID', message: 'Código inválido (mínimo 6 dígitos).' };
  const p = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true, barcode: true } });
  if (!p) return { ok: false, reason: 'NAO_ENCONTRADO' };
  const dono = await donoDoCodigo(code);
  if (dono && dono.id !== productId) return { ok: false, reason: 'JA_USADO', message: `Este código já pertence a "${dono.name}". Use "Transferir" se ele estiver no produto errado.` };

  if (!dono) {
    /* Quem mantém o catálogo já REVISOU ao adicionar — o código não fica na fila. */
    await prisma.productBarcode.create({ data: { productId, code, createdById: user.id, reviewedAt: new Date() } });
    await registrarMudanca({ code, action: 'ADD', to: p, user });
  }
  if (opts.principal || !p.barcode) await prisma.product.update({ where: { id: productId }, data: { barcode: code } });
  await audit({ userId: user.id, action: 'PRODUCT_BARCODE_ADD', module: 'PRODUCTS', entity: 'product', entityId: productId, metadata: { produto: p.name, code, principal: Boolean(opts.principal), origem: 'ficha' }, ...ctx });
  return { ok: true };
}

export async function removerCodigo(user: SessionUser, productId: string, codigoBruto: string, ctx: Ctx = {}): Promise<FichaResult> {
  if (!podeGerirCatalogo(user)) return { ok: false, reason: 'FORBIDDEN' };
  const code = normalizarCodigoDeBarras(codigoBruto);
  if (!code) return { ok: false, reason: 'INVALID' };
  const p = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true, barcode: true, barcodes: { select: { code: true } } } });
  if (!p) return { ok: false, reason: 'NAO_ENCONTRADO' };
  const tem = p.barcode === code || p.barcodes.some((b) => b.code === code);
  if (!tem) return { ok: false, reason: 'NAO_ENCONTRADO', message: 'Este código não está neste produto.' };

  await prisma.productBarcode.deleteMany({ where: { productId, code } });
  if (p.barcode === code) {
    /* O principal que sai é substituído pelo próximo código que restar — o
       produto não fica sem "código principal" enquanto tiver algum. */
    const proximo = p.barcodes.map((b) => b.code).find((c) => c !== code) ?? null;
    await prisma.product.update({ where: { id: productId }, data: { barcode: proximo } });
  }
  await registrarMudanca({ code, action: 'REMOVE', from: p, user });
  await audit({ userId: user.id, action: 'PRODUCT_BARCODE_REMOVE', module: 'PRODUCTS', entity: 'product', entityId: productId, metadata: { produto: p.name, code }, ...ctx });
  return { ok: true };
}

/**
 * TRANSFERIR um código para outro produto — a correção do vínculo errado.
 *
 * Vale daqui para a frente: o próximo bip abre o produto certo. Os pedidos já
 * gravados continuam como estavam (retrato do dia). Fica no histórico dos DOIS
 * produtos: de quem saiu e para quem foi.
 */
export async function transferirCodigo(user: SessionUser, codigoBruto: string, toProductId: string, reason?: string | null, ctx: Ctx = {}): Promise<FichaResult> {
  if (!podeGerirCatalogo(user)) return { ok: false, reason: 'FORBIDDEN' };
  const code = normalizarCodigoDeBarras(codigoBruto);
  if (!code) return { ok: false, reason: 'INVALID' };
  const [dono, destino] = await Promise.all([
    donoDoCodigo(code),
    prisma.product.findUnique({ where: { id: toProductId }, select: { id: true, name: true, barcode: true } }),
  ]);
  if (!destino) return { ok: false, reason: 'NAO_ENCONTRADO', message: 'Produto de destino não encontrado.' };
  if (!dono) return { ok: false, reason: 'NAO_ENCONTRADO', message: 'Este código não está em produto nenhum — use "Adicionar".' };
  if (dono.id === destino.id) return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.productBarcode.deleteMany({ where: { code } });
    await tx.productBarcode.create({ data: { productId: destino.id, code, createdById: user.id, reviewedAt: new Date() } });
    if (dono.barcode === code) {
      const resto = await tx.productBarcode.findFirst({ where: { productId: dono.id }, select: { code: true } });
      await tx.product.update({ where: { id: dono.id }, data: { barcode: resto?.code ?? null } });
    }
    if (!destino.barcode) await tx.product.update({ where: { id: destino.id }, data: { barcode: code } });
  });
  await registrarMudanca({ code, action: 'TRANSFER', from: dono, to: destino, user, reason });
  await audit({
    userId: user.id, action: 'PRODUCT_BARCODE_TRANSFER', module: 'PRODUCTS', entity: 'product', entityId: destino.id,
    metadata: { code, de: { id: dono.id, nome: dono.name }, para: { id: destino.id, nome: destino.name }, motivo: reason?.trim() || null }, ...ctx,
  });
  return { ok: true };
}

/** Marca um código vindo do pedido como revisado — sai da fila "códigos novos". */
export async function revisarCodigo(user: SessionUser, codigoBruto: string, ctx: Ctx = {}): Promise<FichaResult> {
  if (!podeGerirCatalogo(user)) return { ok: false, reason: 'FORBIDDEN' };
  const code = normalizarCodigoDeBarras(codigoBruto);
  if (!code) return { ok: false, reason: 'INVALID' };
  const r = await prisma.productBarcode.updateMany({ where: { code, reviewedAt: null }, data: { reviewedAt: new Date() } });
  if (r.count > 0) await audit({ userId: user.id, action: 'PRODUCT_BARCODE_REVIEW', module: 'PRODUCTS', entity: 'product_barcode', entityId: code, ...ctx });
  return { ok: true };
}

/* ─────────────────────────── lote ─────────────────────────── */

export interface PatchEmLote {
  cdSectorId?: string;
  origin?: string;
  active?: boolean;
}

export type LoteResult = { ok: true; aplicados: number; ignorados: number } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' };

/**
 * Alteração em lote: setor, origem, ativar/desativar. Cada produto passa pela
 * MESMA regra da ficha — o que não pode (CD sem setor, setor inativo) é
 * IGNORADO e contado, nunca aplicado pela metade. "900 aplicados" escondendo
 * 12 recusados esconderia justamente os que precisam de atenção.
 */
export async function alterarEmLote(user: SessionUser, ids: string[], patch: PatchEmLote, ctx: Ctx = {}): Promise<LoteResult> {
  if (!podeGerirCatalogo(user)) return { ok: false, reason: 'FORBIDDEN' };
  const alvo = [...new Set(ids.filter(Boolean))];
  if (alvo.length === 0 || (patch.cdSectorId === undefined && patch.origin === undefined && patch.active === undefined)) return { ok: false, reason: 'INVALID' };

  const setor = patch.cdSectorId ? await prisma.cdSector.findFirst({ where: { id: patch.cdSectorId, active: true }, select: { id: true, name: true } }) : null;
  if (patch.cdSectorId && !setor) return { ok: false, reason: 'INVALID' };
  const origem = patch.origin !== undefined ? (ORIGENS.includes(patch.origin as ProductOrigin) ? (patch.origin as ProductOrigin) : null) : undefined;
  if (origem === null) return { ok: false, reason: 'INVALID' };

  const produtos = await prisma.product.findMany({ where: { id: { in: alvo } }, select: { id: true, origin: true, cdSectorId: true, validation: true } });
  let aplicados = 0;
  const idsOk: string[] = [];
  for (const p of produtos) {
    const novaOrigem = origem ?? p.origin;
    const novoSetor = novaOrigem === 'CD' ? (setor?.id ?? p.cdSectorId) : null;
    /* CD validado sem setor é o estado que some da fila de todos: não se cria em lote. */
    if (novaOrigem === 'CD' && !novoSetor && p.validation === 'VALIDADO') continue;
    idsOk.push(p.id);
  }
  if (idsOk.length > 0) {
    const data: Record<string, unknown> = {};
    if (origem !== undefined) data.origin = origem;
    if (patch.active !== undefined) data.active = Boolean(patch.active);
    if (origem !== undefined && origem !== 'CD') data.cdSectorId = null;
    else if (setor) data.cdSectorId = setor.id;
    const r = await prisma.product.updateMany({ where: { id: { in: idsOk } }, data });
    aplicados = r.count;
    if (data.cdSectorId) await propagarSetorParaItensAbertos(idsOk, ctx).catch(() => {});
  }
  await audit({
    userId: user.id, action: 'PRODUCT_BULK_UPDATE', module: 'PRODUCTS', entity: 'product',
    metadata: { total: alvo.length, aplicados, ignorados: alvo.length - aplicados, setor: setor?.name ?? null, origem: origem ?? null, active: patch.active ?? null }, ...ctx,
  });
  return { ok: true, aplicados, ignorados: alvo.length - aplicados };
}
