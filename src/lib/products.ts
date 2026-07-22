import * as XLSX from 'xlsx';
import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyAdmins } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';
import type { ProductOrigin } from '@prisma/client';

export const ORIGIN_LABEL: Record<ProductOrigin, string> = { FABRICA: 'Fábrica', CD: 'Centro de Distribuição' };
export const REQ_STATUS: Record<string, string> = { NEW: 'Novo', SEPARATING: 'Em separação', SENT: 'Enviado', RECEIVED: 'Recebido' };
const MEASURES = ['un', 'kg', 'cx', 'pct', 'L', 'dz'];

function canManageCatalog(user: SessionUser): boolean { return ['ADMIN', 'CEO', 'SUPERVISOR'].includes(user.role); }

/* ───────── Catálogo ───────── */
export async function listActiveProducts() {
  return prisma.product.findMany({ where: { active: true }, orderBy: [{ category: 'asc' }, { name: 'asc' }], select: { id: true, name: true, origin: true, category: true, measure: true } });
}
export async function listAllProducts() {
  return prisma.product.findMany({ orderBy: [{ active: 'desc' }, { category: 'asc' }, { name: 'asc' }] });
}
export async function upsertProduct(user: SessionUser, input: { id?: string; name: string; origin: string; category?: string; measure?: string }) {
  if (!canManageCatalog(user)) return { ok: false as const, reason: 'FORBIDDEN' as const };
  const origin = input.origin === 'CD' ? 'CD' : input.origin === 'FABRICA' ? 'FABRICA' : null;
  if (!input.name?.trim() || !origin) return { ok: false as const, reason: 'INVALID' as const };
  const data = { name: input.name.trim(), origin: origin as ProductOrigin, category: input.category?.trim() || 'Geral', measure: MEASURES.includes(input.measure ?? '') ? input.measure! : 'un' };
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

/** Import de catálogo por Excel (colunas: Nome, Origem[FABRICA/CD/Fábrica/CD], Categoria, Medida). Upsert por (nome+origem). */
export async function importProductsXlsx(user: SessionUser, buffer: Buffer): Promise<{ ok: true; created: number; updated: number } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' }> {
  if (!canManageCatalog(user)) return { ok: false, reason: 'FORBIDDEN' };
  let rows: Record<string, string>[] = [];
  try {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: false, defval: '' });
  } catch { return { ok: false, reason: 'INVALID' }; }
  let created = 0, updated = 0;
  for (const r of rows) {
    const get = (keys: string[]) => { for (const k of Object.keys(r)) if (keys.some((x) => k.trim().toLowerCase() === x)) return String(r[k]).trim(); return ''; };
    const name = get(['nome', 'produto', 'name']);
    if (!name) continue;
    const originRaw = get(['origem', 'origin']).toUpperCase();
    const origin: ProductOrigin = originRaw.startsWith('CD') || originRaw.includes('DISTRIBUI') ? 'CD' : 'FABRICA';
    const category = get(['categoria', 'category']) || 'Geral';
    const measure = (get(['medida', 'measure', 'un']) || 'un').toLowerCase();
    const existing = await prisma.product.findFirst({ where: { name, origin }, select: { id: true } });
    if (existing) { await prisma.product.update({ where: { id: existing.id }, data: { category, measure: MEASURES.includes(measure) ? measure : 'un', active: true } }); updated++; }
    else { await prisma.product.create({ data: { name, origin, category, measure: MEASURES.includes(measure) ? measure : 'un' } }); created++; }
  }
  await audit({ userId: user.id, action: 'PRODUCT_IMPORT', module: 'CONFIG', metadata: { created, updated } });
  return { ok: true, created, updated };
}

export function exportProductsBuffer(products: { name: string; origin: string; category: string; measure: string; active: boolean }[]): Buffer {
  const rows = products.map((p) => ({ Nome: p.name, Origem: ORIGIN_LABEL[p.origin as ProductOrigin] ?? p.origin, Categoria: p.category, Medida: p.measure, Ativo: p.active ? 'Sim' : 'Não' }));
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Nome: '', Origem: '', Categoria: '', Medida: '', Ativo: '' }]);
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
