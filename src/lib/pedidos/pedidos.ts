import { prisma } from '@/lib/db/prisma';
import { assertUnitAccess, canAccessUnit, unitScopeWhere, UnitScopeError } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyAdmins, notifyUsers } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';
import type { SectorOrderStatus } from '@prisma/client';
import {
  MAX_OBSERVACAO, montarBlocos, normalizarDestino, podeAtender, podeEnviar, proximoStatusDaSecao, rotuloDoDestino, statusDoPedido, veTudo,
  type AcaoNaSecao, type Destino, type SetorParaPedido,
} from './regras';

/**
 * PEDIDOS POR SETOR — leitura e gravação (v1.185.0). As regras vivem em
 * `regras.ts`; aqui é banco, escopo, auditoria e avisos.
 *
 * O pedido é RETRATO: o nome do setor vai congelado no bloco (`sectorName`) e
 * o `sectorId` fica sem FK — renomear ou desativar um setor depois não muda o
 * que foi pedido. O separador enxerga pelo `sectorId` do seu cadastro.
 */

type Ctx = { ip?: string | null; userAgent?: string | null };
export type ResultadoDoPedido = { ok: true; id: string; number: number } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' | 'ESTADO'; message?: string };

const LINK_ENVIADOS = '/modulos/pedidos?aba=enviados';
const LINK_RECEBIDOS = '/modulos/pedidos/recebidos';

/** Os setores ativos do cadastro do CD — a mesma lista para o CD e para a Fábrica (decisão do Pedro). */
export async function setoresParaPedido(): Promise<SetorParaPedido[]> {
  return prisma.cdSector.findMany({ where: { active: true }, orderBy: [{ order: 'asc' }, { name: 'asc' }], select: { id: true, name: true } });
}

/** O setor do separador, lido do cadastro (a sessão não o carrega). */
async function setorDoUsuario(user: SessionUser): Promise<string | null> {
  if (user.role !== 'SEPARATOR') return null;
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { cdSectorId: true } });
  return u?.cdSectorId ?? null;
}

/* ───────────────────────── enviar ───────────────────────── */

export interface EnviarPedidoInput {
  unitId: string;
  destino: string;
  /** Texto por setor (id do setor → linhas). */
  textos: Record<string, unknown>;
  observacao?: string;
}

export async function enviarPedido(user: SessionUser, input: EnviarPedidoInput, ctx: Ctx = {}): Promise<ResultadoDoPedido> {
  if (!podeEnviar(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  try { assertUnitAccess(user, input.unitId); } catch (e) { if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' }; throw e; }
  const destino = normalizarDestino(input.destino);
  if (!destino) return { ok: false, reason: 'INVALID', message: 'Escolha o destino: CD ou Fábrica.' };
  const setores = await setoresParaPedido();
  const blocos = montarBlocos(setores, input.textos ?? {});
  if (blocos.length === 0) return { ok: false, reason: 'INVALID', message: 'Escreva pelo menos um item em algum setor (uma linha por item).' };
  const note = String(input.observacao ?? '').trim().slice(0, MAX_OBSERVACAO) || null;
  const unit = await prisma.unit.findUnique({ where: { id: input.unitId }, select: { name: true } });
  if (!unit) return { ok: false, reason: 'NOT_FOUND' };

  const rec = await prisma.sectorOrder.create({
    data: {
      unitId: input.unitId, destination: destino, note, createdById: user.id, createdByName: user.name,
      sections: { create: blocos.map((b, i) => ({ sectorId: b.sectorId, sectorName: b.sectorName, position: i, lines: b.lines })) },
    },
    select: { id: true, number: true },
  });
  await audit({ userId: user.id, unitId: input.unitId, action: 'ORDER_SENT', module: 'ORDERS', entity: 'sector_order', entityId: rec.id, metadata: { number: rec.number, destino, setores: blocos.map((b) => `${b.sectorName} (${b.lines.length})`) }, ...ctx });

  /* Avisos: os separadores dos setores envolvidos; na Fábrica (e quando um setor não tem separador) os Admins. */
  const itens = blocos.reduce((n, b) => n + b.lines.length, 0);
  const payload = { title: `Pedido nº ${rec.number} de ${unit.name} (${rotuloDoDestino(destino)})`, body: `${user.name} enviou ${blocos.length} setor(es), ${itens} item(ns): ${blocos.map((b) => b.sectorName).join(', ')}.`, link: LINK_RECEBIDOS, module: 'ORDERS' };
  const separadores = destino === 'CD' ? await prisma.user.findMany({ where: { role: 'SEPARATOR', active: true, cdSectorId: { in: blocos.map((b) => b.sectorId) } }, select: { id: true, cdSectorId: true } }) : [];
  const setoresSemSeparador = blocos.filter((b) => !separadores.some((s) => s.cdSectorId === b.sectorId));
  await Promise.all([
    separadores.length ? notifyUsers(separadores.map((s) => s.id), payload) : Promise.resolve(),
    destino === 'FABRICA' || setoresSemSeparador.length ? notifyAdmins(payload) : Promise.resolve(),
  ]).catch(() => {});
  return { ok: true, id: rec.id, number: rec.number };
}

/* ───────────────────────── leitura ───────────────────────── */

export interface SecaoDoPedido {
  id: string; sectorId: string | null; sectorName: string; lines: string[]; status: SectorOrderStatus;
  receivedByName: string | null; receivedAt: string | null; attendedByName: string | null; attendedAt: string | null;
}
export interface PedidoDaTela {
  id: string; number: number; unitId: string; unitName: string; destino: Destino; status: SectorOrderStatus; note: string | null;
  createdByName: string; sentAt: string; attendedAt: string | null;
  secoes: SecaoDoPedido[];
}

const secao = (s: { id: string; sectorId: string | null; sectorName: string; lines: string[]; status: SectorOrderStatus; receivedByName: string | null; receivedAt: Date | null; attendedByName: string | null; attendedAt: Date | null }): SecaoDoPedido => ({
  id: s.id, sectorId: s.sectorId, sectorName: s.sectorName, lines: s.lines, status: s.status,
  receivedByName: s.receivedByName, receivedAt: s.receivedAt?.toISOString() ?? null, attendedByName: s.attendedByName, attendedAt: s.attendedAt?.toISOString() ?? null,
});
const pedido = (r: { id: string; number: number; unitId: string; unit: { name: string }; destination: Destino; status: SectorOrderStatus; note: string | null; createdByName: string; sentAt: Date; attendedAt: Date | null; sections: Parameters<typeof secao>[0][] }): PedidoDaTela => ({
  id: r.id, number: r.number, unitId: r.unitId, unitName: r.unit.name, destino: r.destination, status: r.status, note: r.note, createdByName: r.createdByName,
  sentAt: r.sentAt.toISOString(), attendedAt: r.attendedAt?.toISOString() ?? null, secoes: [...r.sections].sort((a, b) => (a as { position?: number }).position! - (b as { position?: number }).position!).map(secao),
});
const INCLUDE = { unit: { select: { name: true } }, sections: { orderBy: { position: 'asc' as const } } };

/** Os pedidos das unidades no escopo (filtro de unidade em AND), mais recentes primeiro. */
export async function listarPedidosDaUnidade(user: SessionUser, unitId?: string): Promise<PedidoDaTela[]> {
  const rows = await prisma.sectorOrder.findMany({
    where: { ...unitScopeWhere(user, 'unitId'), ...(unitId ? { unitId } : {}) },
    orderBy: { sentAt: 'desc' }, take: 200, include: INCLUDE,
  });
  return rows.map(pedido);
}

/** Um pedido: quem é da unidade vê; o separador vê se algum bloco é do setor dele; Admin/CEO veem tudo. */
export async function getPedido(user: SessionUser, id: string): Promise<PedidoDaTela | null> {
  const r = await prisma.sectorOrder.findUnique({ where: { id }, include: INCLUDE });
  if (!r) return null;
  if (veTudo(user.role) || canAccessUnit(user, r.unitId)) return pedido(r);
  const setor = await setorDoUsuario(user);
  if (setor && r.sections.some((s) => s.sectorId === setor)) return pedido(r);
  return null;
}

/**
 * A caixa de entrada: o separador vê os pedidos com bloco do SEU setor (e só
 * esse bloco); Admin/CEO veem tudo. `abertos` = ainda não atendidos (do ponto
 * de vista de quem olha).
 */
export async function listarRecebidos(user: SessionUser, opts: { abertos?: boolean; destino?: Destino } = {}): Promise<PedidoDaTela[]> {
  if (!podeAtender(user.role)) return [];
  const setor = await setorDoUsuario(user);
  if (user.role === 'SEPARATOR' && !setor) return [];
  const filtroSecao = setor ? { sectorId: setor } : {};
  const rows = await prisma.sectorOrder.findMany({
    where: {
      ...(opts.destino ? { destination: opts.destino } : {}),
      sections: { some: { ...filtroSecao, ...(opts.abertos ? { status: { not: 'ATENDIDO' } } : {}) } },
    },
    orderBy: { sentAt: 'desc' }, take: 300,
    include: { unit: { select: { name: true } }, sections: { where: filtroSecao, orderBy: { position: 'asc' } } },
  });
  return rows.map(pedido);
}

/* ───────────────────────── receber / atender ───────────────────────── */

export async function marcarSecao(user: SessionUser, sectionId: string, acao: AcaoNaSecao, ctx: Ctx = {}): Promise<ResultadoDoPedido> {
  if (!podeAtender(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const s = await prisma.sectorOrderSection.findUnique({ where: { id: sectionId }, include: { order: { select: { id: true, number: true, unitId: true, createdById: true, destination: true } } } });
  if (!s) return { ok: false, reason: 'NOT_FOUND' };
  if (user.role === 'SEPARATOR') {
    const setor = await setorDoUsuario(user);
    if (!setor || s.sectorId !== setor) return { ok: false, reason: 'FORBIDDEN' };
  }
  const novo = proximoStatusDaSecao(s.status, acao);
  if (!novo) return { ok: false, reason: 'ESTADO', message: acao === 'receber' ? 'Este setor já foi recebido.' : 'Este setor já foi atendido.' };
  const agora = new Date();
  const dados = novo === 'RECEBIDO'
    ? { status: novo, receivedById: user.id, receivedByName: user.name, receivedAt: agora }
    : { status: novo, attendedById: user.id, attendedByName: user.name, attendedAt: agora, ...(s.status === 'ENVIADO' ? { receivedById: user.id, receivedByName: user.name, receivedAt: agora } : {}) };
  await prisma.sectorOrderSection.update({ where: { id: sectionId }, data: dados });
  const todas = await prisma.sectorOrderSection.findMany({ where: { orderId: s.orderId }, select: { status: true } });
  const statusPedido = statusDoPedido(todas.map((x) => x.status));
  await prisma.sectorOrder.update({ where: { id: s.orderId }, data: { status: statusPedido, attendedAt: statusPedido === 'ATENDIDO' ? agora : null } });
  await audit({ userId: user.id, unitId: s.order.unitId, action: acao === 'receber' ? 'ORDER_SECTION_RECEIVED' : 'ORDER_SECTION_ATTENDED', module: 'ORDERS', entity: 'sector_order_section', entityId: sectionId, metadata: { number: s.order.number, setor: s.sectorName, de: s.status, para: novo, pedido: statusPedido }, ...ctx });
  if (s.order.createdById && novo === 'ATENDIDO') {
    await notifyUsers([s.order.createdById], {
      title: statusPedido === 'ATENDIDO' ? `Pedido nº ${s.order.number} atendido` : `Pedido nº ${s.order.number}: ${s.sectorName} atendido`,
      body: `${user.name} atendeu ${s.sectorName} (${rotuloDoDestino(s.order.destination)})${statusPedido === 'ATENDIDO' ? ' — todos os setores do pedido foram atendidos.' : '.'}`,
      link: LINK_ENVIADOS, module: 'ORDERS',
    }).catch(() => {});
  }
  return { ok: true, id: s.orderId, number: s.order.number };
}
