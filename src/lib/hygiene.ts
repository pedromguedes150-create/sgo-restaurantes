import { prisma } from '@/lib/db/prisma';
import { canAccessUnit } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyUnitRole } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';

/**
 * O que o cliente informa ao ler o QR (v1.156.0) — um toque e está enviado.
 * Pedido do Pedro: "o banheiro está precisando de limpeza ou está faltando
 * sabonete e papel". Os rótulos antigos ('Papel/insumos', 'Piso/cheiro',
 * 'Vaso/pia') continuam valendo no histórico e na análise.
 */
export const HYGIENE_ISSUES = ['Precisa de limpeza', 'Falta papel', 'Falta sabonete', 'Lixo cheio', 'Necessita de manutenção', 'Outro'] as const;

/** O mesmo aviso (banheiro + motivo) repetido dentro desta janela não vira outro alerta. */
export const JANELA_REPETICAO_MIN = 5;

/** Hora em Brasília (o servidor roda em UTC — getHours() daria 3h a mais). */
const horaBR = (d: Date) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(d)) % 24;

/* ───────── Público (QR do banheiro) ───────── */
export async function getPublicHygieneUnit(unitId: string) {
  const unit = await prisma.unit.findFirst({ where: { id: unitId, active: true }, select: { id: true, name: true } });
  if (!unit) return null;
  const locations = await prisma.hygieneLocation.findMany({ where: { unitId, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  return { unit, locations };
}

export async function createHygieneRequest(input: { unitId: string; locationId?: string | null; issue?: string | null; rating?: number | null; comment?: string | null }): Promise<{ ok: true; id: string; repetido: boolean } | { ok: false }> {
  const unit = await prisma.unit.findFirst({ where: { id: input.unitId, active: true }, select: { id: true, name: true } });
  if (!unit) return { ok: false };
  let locationName = 'Banheiro';
  if (input.locationId) {
    const loc = await prisma.hygieneLocation.findUnique({ where: { id: input.locationId }, select: { name: true, unitId: true } });
    if (loc && loc.unitId === input.unitId) locationName = loc.name;
  }
  const rating = input.rating && input.rating >= 1 && input.rating <= 5 ? Math.round(input.rating) : null;
  const issue = input.issue?.trim().slice(0, 60) || null;

  /* Link público: o mesmo aviso (banheiro + motivo) em ABERTO nos últimos
     minutos não vira outro alerta — três clientes lendo o mesmo QR não podem
     fazer o celular do gerente tocar três vezes pela mesma coisa. */
  const recente = await prisma.hygieneRequest.findFirst({
    where: { unitId: input.unitId, locationName, issue, status: 'OPEN', createdAt: { gte: new Date(Date.now() - JANELA_REPETICAO_MIN * 60_000) } },
    select: { id: true },
  });
  if (recente) return { ok: true, id: recente.id, repetido: true };

  const r = await prisma.hygieneRequest.create({
    data: {
      unitId: input.unitId, locationId: input.locationId || null, locationName,
      issue, rating, comment: input.comment?.trim()?.slice(0, 300) || null,
    },
  });
  /* Alerta PRÓPRIO (v1.156.0): crítico (passa por cima da preferência de
     categoria e fica na tela até ser tocado), vibração diferente no celular e
     som no SGO aberto. Vai para o gerente E o coordenador da unidade. */
  const aviso = {
    title: `🚨 Banheiro ${locationName}: ${issue ?? 'precisa de atenção'}`,
    body: `${unit.name} — um cliente avisou agora pelo QR. Toque para ver.`,
    link: '/modulos/higiene', module: 'TASKS', critical: true, alerta: 'higiene' as const, tag: `sgo-higiene-${r.id}`,
  };
  await Promise.all([notifyUnitRole(input.unitId, 'MANAGER', aviso), notifyUnitRole(input.unitId, 'COORDINATOR', aviso)]).catch(() => {});
  return { ok: true, id: r.id, repetido: false };
}

/** Avaliação opcional DEPOIS do envio (página pública): só uma vez e só na primeira hora. */
export async function avaliarHygieneRequest(id: string, rating: number): Promise<{ ok: boolean }> {
  const n = Math.round(Number(rating));
  if (!(n >= 1 && n <= 5)) return { ok: false };
  const r = await prisma.hygieneRequest.updateMany({ where: { id, rating: null, createdAt: { gte: new Date(Date.now() - 3_600_000) } }, data: { rating: n } });
  return { ok: r.count > 0 };
}

/** Avisos em aberto mais novos que `desde` no alcance do usuário — o "apito" do SGO aberto. */
export async function alertasDeHigiene(user: SessionUser, desde: Date) {
  const unidades = (await prisma.unit.findMany({ where: { active: true }, select: { id: true, name: true } })).filter((u) => canAccessUnit(user, u.id));
  if (!unidades.length) return [];
  const nome = new Map(unidades.map((u) => [u.id, u.name]));
  const rs = await prisma.hygieneRequest.findMany({
    where: { unitId: { in: unidades.map((u) => u.id) }, status: 'OPEN', createdAt: { gt: desde } },
    orderBy: { createdAt: 'desc' }, take: 20,
    select: { id: true, unitId: true, locationName: true, issue: true, createdAt: true },
  });
  return rs.map((r) => ({ id: r.id, unidade: nome.get(r.unitId) ?? '', banheiro: r.locationName, motivo: r.issue, em: r.createdAt.toISOString() }));
}

/* ───────── Interno (gestão + análise) ───────── */
export async function listHygieneRequests(user: SessionUser, unitId: string, days = 30) {
  if (!canAccessUnit(user, unitId)) return [];
  const since = new Date(Date.now() - days * 86400000);
  return prisma.hygieneRequest.findMany({ where: { unitId, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 300 });
}

export async function resolveHygieneRequest(user: SessionUser, id: string, ctx: { ip?: string | null; userAgent?: string | null } = {}) {
  const r = await prisma.hygieneRequest.findUnique({ where: { id }, select: { unitId: true, status: true } });
  if (!r || !canAccessUnit(user, r.unitId)) return { ok: false as const };
  if (r.status !== 'RESOLVED') {
    await prisma.hygieneRequest.update({ where: { id }, data: { status: 'RESOLVED', resolvedById: user.id, resolvedByName: user.name, resolvedAt: new Date() } });
    await audit({ userId: user.id, unitId: r.unitId, action: 'HYGIENE_RESOLVE', module: 'TASKS', entity: 'hygiene_request', entityId: id, ...ctx });
  }
  return { ok: true as const };
}

export interface HygieneAnalytics {
  total: number; open: number; avgResponseMin: number | null;
  byLocation: { name: string; count: number }[];
  byHour: { hour: number; count: number }[];
  byIssue: { issue: string; count: number }[];
}
export async function getHygieneAnalytics(user: SessionUser, unitId: string, days = 30): Promise<HygieneAnalytics | null> {
  if (!canAccessUnit(user, unitId)) return null;
  const since = new Date(Date.now() - days * 86400000);
  const rows = await prisma.hygieneRequest.findMany({ where: { unitId, createdAt: { gte: since } }, select: { locationName: true, issue: true, status: true, createdAt: true, resolvedAt: true } });
  const byLoc = new Map<string, number>(); const byHour = new Map<number, number>(); const byIssue = new Map<string, number>();
  let respSum = 0, respN = 0, open = 0;
  for (const r of rows) {
    byLoc.set(r.locationName, (byLoc.get(r.locationName) ?? 0) + 1);
    const h = horaBR(new Date(r.createdAt));
    byHour.set(h, (byHour.get(h) ?? 0) + 1);
    if (r.issue) byIssue.set(r.issue, (byIssue.get(r.issue) ?? 0) + 1);
    if (r.status !== 'RESOLVED') open++;
    if (r.resolvedAt) { respSum += (new Date(r.resolvedAt).getTime() - new Date(r.createdAt).getTime()) / 60000; respN++; }
  }
  return {
    total: rows.length, open, avgResponseMin: respN > 0 ? Math.round(respSum / respN) : null,
    byLocation: [...byLoc.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    byHour: [...byHour.entries()].map(([hour, count]) => ({ hour, count })).sort((a, b) => a.hour - b.hour),
    byIssue: [...byIssue.entries()].map(([issue, count]) => ({ issue, count })).sort((a, b) => b.count - a.count),
  };
}

/* ───────── Config de locais (Admin/Supervisão) ───────── */
export async function listHygieneLocations(user: SessionUser, unitId: string) {
  if (!canAccessUnit(user, unitId)) return [];
  return prisma.hygieneLocation.findMany({ where: { unitId }, orderBy: [{ active: 'desc' }, { name: 'asc' }] });
}
export async function upsertHygieneLocation(user: SessionUser, input: { id?: string; unitId: string; name: string }) {
  if (!['ADMIN', 'CEO', 'SUPERVISOR'].includes(user.role)) return { ok: false as const, reason: 'FORBIDDEN' as const };
  if (!canAccessUnit(user, input.unitId) || !input.name?.trim()) return { ok: false as const, reason: 'INVALID' as const };
  if (input.id) await prisma.hygieneLocation.update({ where: { id: input.id }, data: { name: input.name.trim() } });
  else await prisma.hygieneLocation.create({ data: { unitId: input.unitId, name: input.name.trim() } });
  return { ok: true as const };
}
export async function toggleHygieneLocation(user: SessionUser, id: string, active: boolean) {
  if (!['ADMIN', 'CEO', 'SUPERVISOR'].includes(user.role)) return { ok: false as const, reason: 'FORBIDDEN' as const };
  const l = await prisma.hygieneLocation.findUnique({ where: { id }, select: { unitId: true } });
  if (!l || !canAccessUnit(user, l.unitId)) return { ok: false as const, reason: 'FORBIDDEN' as const };
  await prisma.hygieneLocation.update({ where: { id }, data: { active } });
  return { ok: true as const };
}
export async function deleteHygieneLocation(user: SessionUser, id: string) {
  if (!['ADMIN', 'CEO', 'SUPERVISOR'].includes(user.role)) return { ok: false as const, reason: 'FORBIDDEN' as const };
  const l = await prisma.hygieneLocation.findUnique({ where: { id }, select: { unitId: true } });
  if (!l || !canAccessUnit(user, l.unitId)) return { ok: false as const, reason: 'FORBIDDEN' as const };
  await prisma.hygieneLocation.delete({ where: { id } });
  return { ok: true as const };
}
