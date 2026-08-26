import * as XLSX from 'xlsx';
import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyAdmins } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';
import type { ProductOrigin } from '@prisma/client';
import { lerPlanilhaDeProdutos, normalizarCodigoDeBarras } from './products/sheet';

export const ORIGIN_LABEL: Record<ProductOrigin, string> = { FABRICA: 'Fábrica', CD: 'Centro de Distribuição' };
export const REQ_STATUS: Record<string, string> = { NEW: 'Novo', SEPARATING: 'Em separação', SENT: 'Enviado', RECEIVED: 'Recebido' };
const MEASURES = ['un', 'kg', 'cx', 'pct', 'L', 'dz'];

function canManageCatalog(user: SessionUser): boolean { return ['ADMIN', 'CEO', 'SUPERVISOR'].includes(user.role); }

/* ───────── Catálogo ───────── */
export async function listActiveProducts() {
  return prisma.product.findMany({ where: { active: true }, orderBy: [{ category: 'asc' }, { name: 'asc' }], select: { id: true, name: true, origin: true, category: true, measure: true, packSize: true, barcode: true } });
}
export async function listAllProducts() {
  return prisma.product.findMany({ orderBy: [{ active: 'desc' }, { category: 'asc' }, { name: 'asc' }] });
}
export async function upsertProduct(user: SessionUser, input: { id?: string; name: string; origin: string; category?: string; measure?: string; packSize?: number | null; barcode?: string | null }) {
  if (!canManageCatalog(user)) return { ok: false as const, reason: 'FORBIDDEN' as const };
  const origin = input.origin === 'CD' ? 'CD' : input.origin === 'FABRICA' ? 'FABRICA' : null;
  if (!input.name?.trim() || !origin) return { ok: false as const, reason: 'INVALID' as const };
  const data = {
    name: input.name.trim(), origin: origin as ProductOrigin,
    category: input.category?.trim() || 'Geral',
    measure: MEASURES.includes(input.measure ?? '') ? input.measure! : 'un',
    ...(input.packSize !== undefined ? { packSize: input.packSize && input.packSize > 0 ? Math.trunc(input.packSize) : null } : {}),
    ...(input.barcode !== undefined ? { barcode: normalizarCodigoDeBarras(input.barcode) } : {}),
  };
  if (input.id) await prisma.product.update({ where: { id: input.id }, data });
  else await prisma.product.create({ data });
  return { ok: true as const };
}
export async function toggleProduct(user: SessionUser, id: string, active: boolean) {
  if (!canManageCatalog(user)) return { ok: false as const, reason: 'FORBIDDEN' as const };
  await prisma.product.update({ where: { id }, data: { active } }).catch(() => {});
  return { ok: true as const };
}
export async function deleteProduct(user: SessionUser, id: string) {
  if (!canManageCatalog(user)) return { ok: false as const, reason: 'FORBIDDEN' as const };
  await prisma.product.delete({ where: { id } }).catch(() => {});
  return { ok: true as const };
}

export interface ImportProductsResult {
  ok: true;
  created: number;
  updated: number;
  /** Linhas com conteúdo mas sem nome de produto. */
  ignored: number;
  /** Categoria que veio do cabeçalho da planilha ("BEBIDAS"), quando veio. */
  categoryFromHeader: string | null;
  /** A planilha trazia coluna de origem? Se não, valeu a origem escolhida. */
  hadOriginColumn: boolean;
}

/**
 * Import do catálogo por Excel.
 *
 * A leitura da planilha vive em `./products/sheet` e é testada contra o formato
 * de arquivo que a rede usa de verdade — lista do fornecedor, com o nome da
 * categoria no cabeçalho da primeira coluna. O importador anterior exigia uma
 * coluna "Nome": diante de uma planilha real ele ignorava todas as linhas e
 * respondia "0 criados", sem dizer por quê.
 *
 * `defaultOrigin` existe porque a planilha do fornecedor não fala de Fábrica ou
 * CD — quem importa sabe, e adivinhar em silêncio jogaria o catálogo inteiro
 * para o lado errado.
 */
export async function importProductsXlsx(
  user: SessionUser,
  buffer: Buffer,
  defaultOrigin: ProductOrigin = 'FABRICA',
): Promise<ImportProductsResult | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'EMPTY' }> {
  if (!canManageCatalog(user)) return { ok: false, reason: 'FORBIDDEN' };

  let matriz: unknown[][];
  try {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    /* `raw: false` devolve tudo como texto: código de barras é identificador,
       não número — como número, "070847033301" perde os zeros à esquerda e
       deixa de ser o código do produto. */
    matriz = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' }) as unknown[][];
  } catch { return { ok: false, reason: 'INVALID' }; }

  const leitura = lerPlanilhaDeProdutos(matriz);
  /* Planilha sem nenhum produto reconhecido não é "importação com 0 criados":
     é arquivo errado, e dizer isso poupa a pessoa de tentar de novo igual.

     E uma coluna só, sem nenhum rótulo conhecido, é ambíguo demais para virar
     catálogo: é a forma de um arquivo trocado (um .txt, um relatório com título
     na primeira linha). O leitor trata a linha como dado — que é o certo para
     ele, porque descartar produto em silêncio é pior —, mas GRAVAR isso criaria
     produtos com nome de cabeçalho de relatório. Aqui a resposta é recusar e
     pedir a coluna de nomes. */
  const ambigua = !leitura.temCabecalhoReconhecido && leitura.colunas < 2;
  if (leitura.itens.length === 0 || ambigua) return { ok: false, reason: 'EMPTY' };

  let created = 0, updated = 0;
  for (const p of leitura.itens) {
    const origin = p.origin ?? defaultOrigin;
    const measure = MEASURES.includes(p.measure) ? p.measure : 'un';
    /* O código de barras identifica melhor que o nome: um produto renomeado
       ("CERVEJA BRAHMA 600ML" → "CERVEJA BRAHMA 600 ML") viraria um segundo
       cadastro se a chave fosse o nome. */
    const existing = p.barcode
      ? await prisma.product.findFirst({ where: { barcode: p.barcode }, select: { id: true } })
      : await prisma.product.findFirst({ where: { name: p.name, origin }, select: { id: true } });

    const data = { name: p.name, origin, category: p.category, measure, packSize: p.packSize, barcode: p.barcode, active: true };
    if (existing) { await prisma.product.update({ where: { id: existing.id }, data }); updated++; }
    else { await prisma.product.create({ data }); created++; }
  }

  await audit({
    userId: user.id, action: 'PRODUCT_IMPORT', module: 'CONFIG',
    metadata: { created, updated, ignored: leitura.ignoradas, categoria: leitura.categoriaDoCabecalho, origem: leitura.temColunaOrigem ? 'da planilha' : defaultOrigin },
  });
  return {
    ok: true, created, updated,
    ignored: leitura.ignoradas,
    categoryFromHeader: leitura.categoriaDoCabecalho,
    hadOriginColumn: leitura.temColunaOrigem,
  };
}

/**
 * Excel do catálogo — e MODELO de importação.
 *
 * As colunas são exatamente as que o importador entende, então exportar, editar
 * e importar de volta é um ciclo fechado. Com o catálogo vazio sai só o
 * cabeçalho, que é a planilha modelo para preencher.
 */
export function exportProductsBuffer(products: { name: string; origin: string; category: string; measure: string; packSize?: number | null; barcode?: string | null; active: boolean }[]): Buffer {
  const linha = (p: (typeof products)[number]) => ({
    Nome: p.name,
    Origem: ORIGIN_LABEL[p.origin as ProductOrigin] ?? p.origin,
    Categoria: p.category,
    Medida: p.measure,
    Quant: p.packSize ?? '',
    /* Texto, não número: como número o Excel come os zeros à esquerda e
       devolve um código de barras que não existe. */
    'Cod. Barras': p.barcode ? String(p.barcode) : '',
    Ativo: p.active ? 'Sim' : 'Não',
  });
  const rows = products.map(linha);
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Nome: '', Origem: '', Categoria: '', Medida: '', Quant: '', 'Cod. Barras': '', Ativo: '' }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Produtos');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/* ───────── Pedido do gerente ───────── */
export interface OrderItemInput { productId: string; qty: number }
export async function createProductRequests(user: SessionUser, unitId: string, items: OrderItemInput[], note: string | undefined, ctx: { ip?: string | null; userAgent?: string | null } = {}): Promise<{ ok: true; created: number } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' }> {
  if (!canAccessUnit(user, unitId)) return { ok: false, reason: 'FORBIDDEN' };
  const clean = items.filter((i) => i.productId && i.qty > 0);
  if (clean.length === 0) return { ok: false, reason: 'INVALID' };
  const products = await prisma.product.findMany({ where: { id: { in: clean.map((i) => i.productId) }, active: true } });
  const byOrigin: Record<string, { productId: string; name: string; category: string; measure: string; qty: number }[]> = { FABRICA: [], CD: [] };
  for (const it of clean) {
    const p = products.find((x) => x.id === it.productId);
    if (!p) continue;
    byOrigin[p.origin].push({ productId: p.id, name: p.name, category: p.category, measure: p.measure, qty: Math.round(it.qty * 1000) / 1000 });
  }
  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { name: true } });
  let created = 0;
  for (const origin of ['FABRICA', 'CD'] as ProductOrigin[]) {
    const list = byOrigin[origin];
    if (list.length === 0) continue;
    const last = await prisma.productRequest.findFirst({ where: { unitId }, orderBy: { number: 'desc' }, select: { number: true } });
    const number = (last?.number ?? 0) + 1;
    const req = await prisma.productRequest.create({
      data: { unitId, origin, number, createdById: user.id, createdByName: user.name, note: note?.trim() || null, items: list as unknown as object },
      select: { id: true },
    });
    await audit({ userId: user.id, unitId, action: 'PRODUCT_REQUEST', module: 'GENERAL', entity: 'product_request', entityId: req.id, metadata: { origin, items: list.length }, ...ctx });
    created++;
  }
  await notifyAdmins({ title: '📦 Novo pedido de produtos', body: `${unit?.name ?? 'Unidade'}: ${user.name} enviou pedido(s) de produtos.`, link: '/modulos/produtos', module: 'GENERAL' }).catch(() => {});
  return { ok: true, created };
}

export async function listUnitRequests(user: SessionUser, unitId: string) {
  if (!canAccessUnit(user, unitId)) return [];
  return prisma.productRequest.findMany({ where: { unitId }, orderBy: { createdAt: 'desc' }, take: 60 });
}
export async function listIncomingRequests(user: SessionUser, origin?: ProductOrigin) {
  if (!['ADMIN', 'CEO', 'SUPERVISOR'].includes(user.role)) return [];
  return prisma.productRequest.findMany({ where: { ...(origin ? { origin } : {}), status: { not: 'RECEIVED' } }, orderBy: { createdAt: 'asc' }, take: 100 });
}
export async function setRequestStatus(user: SessionUser, id: string, status: string, ctx: { ip?: string | null; userAgent?: string | null } = {}) {
  const req = await prisma.productRequest.findUnique({ where: { id }, select: { unitId: true, createdById: true } });
  if (!req) return { ok: false as const, reason: 'INVALID' as const };
  const isManager = req.createdById === user.id;
  const isOps = ['ADMIN', 'CEO', 'SUPERVISOR'].includes(user.role);
  // Gerente só confirma o RECEBIMENTO; Fábrica/CD (ops) movem os demais status
  if (status === 'RECEIVED' ? !(isManager || isOps) : !isOps) return { ok: false as const, reason: 'FORBIDDEN' as const };
  if (!Object.keys(REQ_STATUS).includes(status)) return { ok: false as const, reason: 'INVALID' as const };
  await prisma.productRequest.update({ where: { id }, data: { status, ...(status === 'RECEIVED' ? { receivedAt: new Date() } : {}) } });
  await audit({ userId: user.id, unitId: req.unitId, action: 'PRODUCT_REQUEST_STATUS', module: 'GENERAL', entity: 'product_request', entityId: id, metadata: { status }, ...ctx });
  return { ok: true as const };
}
