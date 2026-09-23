import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { notifyAdmins, notifyRole } from '@/lib/notifications';
import { normalizarCodigoDeBarras } from '@/lib/products/sheet';
import { possiveisDuplicados, type Semelhante } from '@/lib/products/similaridade';
import type { SessionUser } from '@/lib/auth/session';
import type { PackType } from '@prisma/client';

/**
 * O GERENTE ensina o catálogo sem sair do pedido.
 *
 * Três movimentos, os três permanentes e para a rede inteira:
 *  1. VINCULAR um código desconhecido a um produto que existe;
 *  2. CADASTRAR um produto que realmente não existe — PROVISÓRIO
 *     (`validation = PENDENTE`), mas já no pedido e já respondendo pelo código;
 *  3. e, antes de cadastrar, ver os POSSÍVEIS DUPLICADOS.
 *
 * Por que o gerente pode (e antes não podia): o pedido é feito no estoque,
 * com o produto na mão; recusar o vínculo ali e mandar "peça a quem edita o
 * catálogo" fazia o código cair em "não reconhecido" em todo pedido seguinte —
 * e era assim que nasciam os cadastros duplicados. O que protege o catálogo
 * não é o perfil, é a REGRA: um código responde por um produto só
 * (`ProductBarcode.code @unique`), tudo fica na Auditoria, e Admin/Coordenação
 * validam e corrigem depois (transferir código, definir setor).
 *
 * O provisório nasce `CD` SEM setor. Isso é deliberado e é o que a v1.94.0
 * proibia — com razão, para o cadastro administrativo. Aqui é diferente: o
 * gerente NÃO deve escolher setor (é decisão da Fábrica/CD), e o item precisa
 * entrar no pedido. Ele cai no balde "sem setor" do pedido e no aviso âmbar do
 * catálogo, que já existem; quem classifica é a Administração.
 */

type Ctx = { ip?: string | null; userAgent?: string | null };

/** Quem faz pedido pode vincular e cadastrar provisório. */
const podeEnsinar = (user: SessionUser) => ['MANAGER', 'COORDINATOR', 'SUPERVISOR', 'ADMIN', 'CEO'].includes(user.role);
/** Quem VALIDA: Administração e Coordenação (decisão do Pedro, 23/09/2026), e a Supervisão que já edita o catálogo. */
const podeValidar = (user: SessionUser) => ['ADMIN', 'CEO', 'SUPERVISOR', 'COORDINATOR'].includes(user.role);

export interface ProdutoResumo {
  id: string; name: string; category: string; measure: string; origin: string;
  packSize: number | null; barcode: string | null; barcodes: string[]; validation: string;
}

const SELECT = {
  id: true, name: true, category: true, measure: true, origin: true, packSize: true, barcode: true, validation: true,
  barcodes: { select: { code: true } },
} as const;

type Linha = { id: string; name: string; category: string; measure: string; origin: string; packSize: number | null; barcode: string | null; validation: string; barcodes: { code: string }[] };
const resumo = (p: Linha): ProdutoResumo => ({ ...p, barcodes: p.barcodes.map((b) => b.code) });

/* ─────────────────────────── duplicados ─────────────────────────── */

/** Os produtos ativos do catálogo pedível que PARECEM ser o que o gerente digitou. */
export async function duplicadosProvaveis(nome: string): Promise<Semelhante<ProdutoResumo>[]> {
  if (!nome.trim()) return [];
  const todos = await prisma.product.findMany({ where: { active: true, origin: { in: ['FABRICA', 'CD'] } }, select: SELECT });
  return possiveisDuplicados(todos.map(resumo), nome);
}

/* ─────────────────────────── vincular ─────────────────────────── */

export type VinculoResult =
  | { ok: true; jaExistia: boolean; produto: ProdutoResumo }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NAO_ENCONTRADO' | 'JA_USADO'; message?: string };

/**
 * Vincula PERMANENTEMENTE um código a um produto. Vale para a rede: no próximo
 * pedido, de qualquer gerente, o código já reconhece o produto.
 */
export async function vincularCodigoPeloPedido(user: SessionUser, productId: string, codigoBruto: string, ctx: Ctx = {}): Promise<VinculoResult> {
  if (!podeEnsinar(user)) return { ok: false, reason: 'FORBIDDEN' };
  const code = normalizarCodigoDeBarras(codigoBruto);
  if (!code || code.length < 6 || !productId) return { ok: false, reason: 'INVALID' };

  const produto = await prisma.product.findUnique({ where: { id: productId }, select: SELECT });
  if (!produto) return { ok: false, reason: 'NAO_ENCONTRADO' };

  /* Um código responde por UM produto. Se já é de outro, dizer DE QUEM vale
     mais do que recusar calado — quase sempre é o cadastro do outro que está
     errado, e é isso que a Administração vai corrigir (transferir). */
  const dono = await prisma.product.findFirst({
    where: { OR: [{ barcode: code }, { barcodes: { some: { code } } }] },
    select: { id: true, name: true },
  });
  if (dono && dono.id !== productId) return { ok: false, reason: 'JA_USADO', message: `Este código já pertence a "${dono.name}".` };
  if (dono) return { ok: true, jaExistia: true, produto: resumo(produto) };

  await prisma.productBarcode.create({ data: { productId, code, createdById: user.id } });
  await audit({
    userId: user.id, action: 'PRODUCT_BARCODE_ADD', module: 'PRODUCTS', entity: 'product', entityId: productId,
    metadata: { produto: produto.name, code, origem: 'pedido' }, ...ctx,
  });
  const atualizado = await prisma.product.findUnique({ where: { id: productId }, select: SELECT });
  return { ok: true, jaExistia: false, produto: resumo(atualizado!) };
}

/* ─────────────────────────── cadastro provisório ─────────────────────────── */

export interface ProvisorioInput {
  name: string;
  codigo?: string | null;
  packType?: string;
  packSize?: number | null;
}

export type ProvisorioResult =
  | { ok: true; produto: ProdutoResumo }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'JA_VINCULADO'; message?: string };

const TIPOS: PackType[] = ['UN', 'FARDO', 'DISPLAY'];

/**
 * Cadastro operacional simplificado: nome, código, embalagem. Nada de setor,
 * categoria administrativa ou validade — isso é da validação.
 */
export async function cadastrarProvisorio(user: SessionUser, input: ProvisorioInput, ctx: Ctx = {}): Promise<ProvisorioResult> {
  if (!podeEnsinar(user)) return { ok: false, reason: 'FORBIDDEN' };
  const name = input.name?.trim().slice(0, 120);
  if (!name || name.length < 3) return { ok: false, reason: 'INVALID', message: 'Informe o nome do produto.' };

  const codigo = input.codigo ? normalizarCodigoDeBarras(input.codigo) : null;
  if (codigo) {
    const dono = await prisma.product.findFirst({
      where: { OR: [{ barcode: codigo }, { barcodes: { some: { code: codigo } } }] },
      select: { name: true },
    });
    if (dono) return { ok: false, reason: 'JA_VINCULADO', message: `Este código já pertence a "${dono.name}". Vincule a ele em vez de cadastrar de novo.` };
  }

  const packType = TIPOS.includes(String(input.packType) as PackType) ? (input.packType as PackType) : 'UN';
  const packSize = packType === 'UN' ? null : Math.max(0, Math.trunc(Number(input.packSize) || 0));
  if (packType !== 'UN' && !(packSize && packSize > 1)) {
    return { ok: false, reason: 'INVALID', message: 'Informe quantas unidades vêm no fardo/display.' };
  }

  const produto = await prisma.product.create({
    data: {
      name,
      /* CD sem setor, de propósito — ver o cabeçalho do arquivo. */
      origin: 'CD',
      cdSectorId: null,
      category: 'Geral',
      measure: 'un',
      packType,
      packSize,
      barcode: codigo,
      validation: 'PENDENTE',
      createdById: user.id,
      createdByName: user.name,
      ...(codigo ? { barcodes: { create: { code: codigo, createdById: user.id } } } : {}),
    },
    select: SELECT,
  });

  await audit({
    userId: user.id, action: 'PRODUCT_PROVISIONAL_CREATE', module: 'PRODUCTS', entity: 'product', entityId: produto.id,
    metadata: { nome: name, codigo, packType, packSize }, ...ctx,
  });

  /* Quem valida precisa saber que há cadastro esperando — e o aviso é UM por
     produto, não um resumo diário: o setor sem definir segura o item na fila
     de ninguém até alguém olhar. */
  const aviso = {
    title: 'Novo produto aguardando validação',
    body: `${user.name} cadastrou "${name}" pelo pedido${codigo ? ` (código ${codigo})` : ''}. Confirme nome, embalagem e setor do CD.`,
    link: '/configuracoes/produtos?pendentes=1',
    module: 'PRODUCTS',
  };
  await Promise.all([notifyAdmins(aviso), notifyRole('COORDINATOR', aviso)]).catch(() => {});

  return { ok: true, produto: resumo(produto) };
}

/* ─────────────────────────── validar ─────────────────────────── */

export type ValidarResult = { ok: true } | { ok: false; reason: 'FORBIDDEN' | 'NAO_ENCONTRADO' | 'SEM_SETOR' };

/**
 * Confirma um cadastro provisório. Produto do CD só se valida COM setor: é o
 * setor que o tira do balde "sem setor" e o entrega a um separador — validar
 * sem ele seria carimbar como certo um cadastro que ainda não chega a ninguém.
 */
export async function validarProduto(user: SessionUser, id: string, ctx: Ctx = {}): Promise<ValidarResult> {
  if (!podeValidar(user)) return { ok: false, reason: 'FORBIDDEN' };
  const p = await prisma.product.findUnique({ where: { id }, select: { id: true, name: true, origin: true, cdSectorId: true, validation: true } });
  if (!p) return { ok: false, reason: 'NAO_ENCONTRADO' };
  if (p.origin === 'CD' && !p.cdSectorId) return { ok: false, reason: 'SEM_SETOR' };
  if (p.validation === 'VALIDADO') return { ok: true };

  await prisma.product.update({ where: { id }, data: { validation: 'VALIDADO', validatedById: user.id, validatedAt: new Date() } });
  await audit({ userId: user.id, action: 'PRODUCT_VALIDATE', module: 'PRODUCTS', entity: 'product', entityId: id, metadata: { nome: p.name }, ...ctx });
  return { ok: true };
}

/** Quantos cadastros provisórios esperam validação (para o aviso do catálogo). */
export async function pendentesDeValidacao(): Promise<number> {
  return prisma.product.count({ where: { validation: 'PENDENTE', active: true } });
}
