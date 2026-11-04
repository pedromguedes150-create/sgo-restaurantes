import { prisma } from '@/lib/db/prisma';
import { assertUnitAccess, canAccessUnit, unitScopeWhere, UnitScopeError } from '@/lib/scope/unit-scope';
import { audit } from '@/lib/audit';
import { notifyAdmins, notifyUsers } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';
import type { SectorOrderStatus } from '@prisma/client';
import {
  MAX_OBSERVACAO, blocoEditavel, destinosDoPedido, linhasDoTexto, montarBlocos, pedidoEditavel, podeAtender, podeEnviar, proximoStatusDaSecao, rotuloDoDestino, rotuloDosDestinos, statusDoPedido, veTudo,
  type AcaoNaSecao, type Destino, type SetorParaPedido,
} from './regras';

/**
 * PEDIDOS POR SETOR — leitura e gravação (v1.185.0 · v1.187.0). As regras
 * vivem em `regras.ts`; aqui é banco, escopo, auditoria e avisos.
 *
 * O pedido é RETRATO: o nome do setor e o DESTINO (v1.187.0) vão congelados
 * no bloco (`sectorName`, `destination`) e o `sectorId` fica sem FK — renomear,
 * desativar ou mudar o destino de um setor depois não muda o que foi pedido. O
 * separador enxerga pelo `sectorId` do seu cadastro.
 */

type Ctx = { ip?: string | null; userAgent?: string | null };
export type ResultadoDoPedido = { ok: true; id: string; number: number } | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NOT_FOUND' | 'ESTADO'; message?: string };

const LINK_ENVIADOS = '/modulos/pedidos?aba=enviados';
const LINK_RECEBIDOS = '/modulos/pedidos/recebidos';

/** Os setores ativos do cadastro do CD, cada um com o seu destino (Fábrica · CD · Almoxarifado). */
export async function setoresParaPedido(): Promise<SetorParaPedido[]> {
  return prisma.cdSector.findMany({ where: { active: true }, orderBy: [{ order: 'asc' }, { name: 'asc' }], select: { id: true, name: true, destination: true } });
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
  /** Texto por setor (id do setor → linhas). */
  textos: Record<string, unknown>;
  observacao?: string;
}

/**
 * Envia o pedido: UM pedido, com um bloco por setor que tem linha, cada bloco
 * com o destino do setor. v1.187.0: nenhum item é obrigatório (decisão do
 * Pedro) — o pedido pode ir só com a observação; nesse caso quem é avisado
 * são os Admins, porque não há setor para encaminhar.
 */
export async function enviarPedido(user: SessionUser, input: EnviarPedidoInput, ctx: Ctx = {}): Promise<ResultadoDoPedido> {
  if (!podeEnviar(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  try { assertUnitAccess(user, input.unitId); } catch (e) { if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' }; throw e; }
  const setores = await setoresParaPedido();
  const blocos = montarBlocos(setores, input.textos ?? {});
  const note = String(input.observacao ?? '').trim().slice(0, MAX_OBSERVACAO) || null;
  const unit = await prisma.unit.findUnique({ where: { id: input.unitId }, select: { name: true } });
  if (!unit) return { ok: false, reason: 'NOT_FOUND' };

  const rec = await prisma.sectorOrder.create({
    data: {
      unitId: input.unitId, note, createdById: user.id, createdByName: user.name,
      sections: { create: blocos.map((b, i) => ({ sectorId: b.sectorId, sectorName: b.sectorName, destination: b.destination, position: i, lines: b.lines })) },
    },
    select: { id: true, number: true },
  });
  await audit({ userId: user.id, unitId: input.unitId, action: 'ORDER_SENT', module: 'ORDERS', entity: 'sector_order', entityId: rec.id, metadata: { number: rec.number, destinos: destinosDoPedido(blocos), setores: blocos.map((b) => `${b.sectorName} (${b.lines.length}, ${rotuloDoDestino(b.destination)})`) }, ...ctx });

  /* Avisos: os separadores dos setores envolvidos; setor sem separador (ou pedido sem setor) → os Admins. */
  const itens = blocos.reduce((n, b) => n + b.lines.length, 0);
  const destinos = rotuloDosDestinos(blocos);
  const payload = {
    title: `Pedido nº ${rec.number} de ${unit.name}${destinos ? ` (${destinos})` : ''}`,
    body: blocos.length ? `${user.name} enviou ${blocos.length} setor(es), ${itens} item(ns): ${blocos.map((b) => b.sectorName).join(', ')}.` : `${user.name} enviou um pedido só com observação${note ? `: ${note}` : ''}.`,
    link: LINK_RECEBIDOS, module: 'ORDERS',
  };
  const separadores = blocos.length ? await prisma.user.findMany({ where: { role: 'SEPARATOR', active: true, cdSectorId: { in: blocos.map((b) => b.sectorId) } }, select: { id: true, cdSectorId: true } }) : [];
  const setoresSemSeparador = blocos.filter((b) => !separadores.some((s) => s.cdSectorId === b.sectorId));
  await Promise.all([
    separadores.length ? notifyUsers(separadores.map((s) => s.id), payload) : Promise.resolve(),
    blocos.length === 0 || setoresSemSeparador.length ? notifyAdmins(payload) : Promise.resolve(),
  ]).catch(() => {});
  return { ok: true, id: rec.id, number: rec.number };
}

/* ───────────────────────── editar (v1.188.0) ───────────────────────── */

export interface EditarPedidoInput { id: string; textos: Record<string, unknown>; observacao?: string }

/**
 * O gerente altera o que enviou — decisão do Pedro (04/11): pode editar até o
 * separador marcar "Em separação". A regra é POR BLOCO: bloco Enviado aceita
 * alteração, remoção (texto vazio) e o pedido aceita setor novo e observação;
 * bloco em separação ou atendido é travado (qualquer diferença recusa com o
 * nome do setor). Pedido inteiro atendido não se edita.
 */
export async function editarPedido(user: SessionUser, input: EditarPedidoInput, ctx: Ctx = {}): Promise<ResultadoDoPedido> {
  if (!podeEnviar(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const r = await prisma.sectorOrder.findUnique({ where: { id: input.id }, include: { unit: { select: { name: true } }, sections: { orderBy: { position: 'asc' } } } });
  if (!r) return { ok: false, reason: 'NOT_FOUND' };
  try { assertUnitAccess(user, r.unitId); } catch (e) { if (e instanceof UnitScopeError) return { ok: false, reason: 'FORBIDDEN' }; throw e; }
  if (!pedidoEditavel(r.status)) return { ok: false, reason: 'ESTADO', message: 'Este pedido já foi atendido por todos os setores e não pode mais ser alterado.' };
  const setores = await setoresParaPedido();
  const textos = input.textos ?? {};
  const iguais = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

  /* travados: qualquer diferença no texto recusa, nomeando o setor */
  for (const s of r.sections) {
    if (blocoEditavel(s.status) || !s.sectorId || !(s.sectorId in textos)) continue;
    if (!iguais(linhasDoTexto(textos[s.sectorId]), s.lines)) return { ok: false, reason: 'ESTADO', message: `O setor ${s.sectorName} já está em separação e não pode mais ser alterado.` };
  }

  const adicionados: string[] = []; const alterados: string[] = []; const removidos: string[] = [];
  const setoresTocados = new Set<string>();
  let posicao = r.sections.reduce((m, s) => Math.max(m, s.position), -1) + 1;
  await prisma.$transaction(async (tx) => {
    for (const setor of setores) {
      const lines = linhasDoTexto(textos[setor.id]);
      const atual = r.sections.find((s) => s.sectorId === setor.id);
      if (atual) {
        if (!blocoEditavel(atual.status)) continue;
        if (lines.length === 0) { await tx.sectorOrderSection.delete({ where: { id: atual.id } }); removidos.push(atual.sectorName); setoresTocados.add(setor.id); }
        else if (!iguais(lines, atual.lines)) { await tx.sectorOrderSection.update({ where: { id: atual.id }, data: { lines } }); alterados.push(atual.sectorName); setoresTocados.add(setor.id); }
      } else if (lines.length > 0) {
        await tx.sectorOrderSection.create({ data: { orderId: r.id, sectorId: setor.id, sectorName: setor.name, destination: setor.destination, position: posicao++, lines } });
        adicionados.push(setor.name); setoresTocados.add(setor.id);
      }
    }
    const note = input.observacao === undefined ? r.note : (String(input.observacao).trim().slice(0, MAX_OBSERVACAO) || null);
    const restantes = await tx.sectorOrderSection.findMany({ where: { orderId: r.id }, select: { status: true } });
    const status = statusDoPedido(restantes.map((x) => x.status));
    await tx.sectorOrder.update({ where: { id: r.id }, data: { note, status, attendedAt: status === 'ATENDIDO' ? new Date() : null } });
  });
  await audit({ userId: user.id, unitId: r.unitId, action: 'ORDER_EDITED', module: 'ORDERS', entity: 'sector_order', entityId: r.id, metadata: { number: r.number, adicionados, alterados, removidos, observacao: input.observacao !== undefined && (String(input.observacao).trim() || null) !== r.note }, ...ctx });

  if (setoresTocados.size) {
    const payload = { title: `Pedido nº ${r.number} de ${r.unit.name} alterado`, body: `${user.name} alterou o pedido: ${[...adicionados.map((s) => `+${s}`), ...alterados, ...removidos.map((s) => `−${s}`)].join(', ')}.`, link: LINK_RECEBIDOS, module: 'ORDERS' };
    const separadores = await prisma.user.findMany({ where: { role: 'SEPARATOR', active: true, cdSectorId: { in: [...setoresTocados] } }, select: { id: true, cdSectorId: true } });
    const semSeparador = [...setoresTocados].filter((id) => !separadores.some((s) => s.cdSectorId === id));
    await Promise.all([
      separadores.length ? notifyUsers(separadores.map((s) => s.id), payload) : Promise.resolve(),
      semSeparador.length ? notifyAdmins(payload) : Promise.resolve(),
    ]).catch(() => {});
  }
  return { ok: true, id: r.id, number: r.number };
}

/* ───────────────────────── leitura ───────────────────────── */

export interface SecaoDoPedido {
  id: string; sectorId: string | null; sectorName: string; destination: Destino; lines: string[]; status: SectorOrderStatus;
  receivedByName: string | null; receivedAt: string | null; attendedByName: string | null; attendedAt: string | null;
}
export interface PedidoDaTela {
  id: string; number: number; unitId: string; unitName: string; status: SectorOrderStatus; note: string | null;
  createdByName: string; sentAt: string; attendedAt: string | null;
  /** Os destinos presentes nos blocos (Fábrica · CD · Almoxarifado), derivados. */
  destinos: Destino[];
  secoes: SecaoDoPedido[];
}

type SecaoDoBanco = { id: string; sectorId: string | null; sectorName: string; destination: Destino; position: number; lines: string[]; status: SectorOrderStatus; receivedByName: string | null; receivedAt: Date | null; attendedByName: string | null; attendedAt: Date | null };
const secao = (s: SecaoDoBanco): SecaoDoPedido => ({
  id: s.id, sectorId: s.sectorId, sectorName: s.sectorName, destination: s.destination, lines: s.lines, status: s.status,
  receivedByName: s.receivedByName, receivedAt: s.receivedAt?.toISOString() ?? null, attendedByName: s.attendedByName, attendedAt: s.attendedAt?.toISOString() ?? null,
});
const pedido = (r: { id: string; number: number; unitId: string; unit: { name: string }; status: SectorOrderStatus; note: string | null; createdByName: string; sentAt: Date; attendedAt: Date | null; sections: SecaoDoBanco[] }): PedidoDaTela => {
  const secoes = [...r.sections].sort((a, b) => a.position - b.position).map(secao);
  return {
    id: r.id, number: r.number, unitId: r.unitId, unitName: r.unit.name, status: r.status, note: r.note, createdByName: r.createdByName,
    sentAt: r.sentAt.toISOString(), attendedAt: r.attendedAt?.toISOString() ?? null, destinos: destinosDoPedido(secoes), secoes,
  };
};
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

export type SituacaoDaCaixa = 'todos' | 'abertos' | 'atendidos';
/**
 * A caixa de entrada: o separador vê os pedidos com bloco do SEU setor (e só
 * esse bloco); Admin/CEO veem tudo, e podem filtrar por destino (só os blocos
 * daquele destino). `situacao` (v1.188.0): 'todos' (padrão — o pedido atendido
 * NÃO some, decisão do Pedro), 'abertos' = algum bloco ainda não atendido,
 * 'atendidos' = algum bloco atendido. Pedido sem bloco (só observação) aparece
 * para o Admin em 'todos' e 'abertos'.
 */
export async function listarRecebidos(user: SessionUser, opts: { situacao?: SituacaoDaCaixa; destino?: Destino } = {}): Promise<PedidoDaTela[]> {
  if (!podeAtender(user.role)) return [];
  const setor = await setorDoUsuario(user);
  if (user.role === 'SEPARATOR' && !setor) return [];
  const situacao = opts.situacao ?? 'todos';
  const filtroSecao = { ...(setor ? { sectorId: setor } : {}), ...(opts.destino ? { destination: opts.destino } : {}) };
  const temFiltro = Object.keys(filtroSecao).length > 0;
  const semBloco = !temFiltro && situacao !== 'atendidos' ? [{ sections: { none: {} } }] : [];
  const porSituacao = situacao === 'abertos' ? { status: { not: 'ATENDIDO' as const } } : situacao === 'atendidos' ? { status: 'ATENDIDO' as const } : {};
  const rows = await prisma.sectorOrder.findMany({
    where: {
      OR: [
        { sections: { some: { ...filtroSecao, ...porSituacao } } },
        ...semBloco,
      ],
    },
    orderBy: { sentAt: 'desc' }, take: 300,
    include: { unit: { select: { name: true } }, sections: { where: filtroSecao, orderBy: { position: 'asc' } } },
  });
  return rows.map(pedido);
}

/* ───────────────────────── separar / atender ───────────────────────── */

export async function marcarSecao(user: SessionUser, sectionId: string, acao: AcaoNaSecao, ctx: Ctx = {}): Promise<ResultadoDoPedido> {
  if (!podeAtender(user.role)) return { ok: false, reason: 'FORBIDDEN' };
  const s = await prisma.sectorOrderSection.findUnique({ where: { id: sectionId }, include: { order: { select: { id: true, number: true, unitId: true, createdById: true } } } });
  if (!s) return { ok: false, reason: 'NOT_FOUND' };
  if (user.role === 'SEPARATOR') {
    const setor = await setorDoUsuario(user);
    if (!setor || s.sectorId !== setor) return { ok: false, reason: 'FORBIDDEN' };
  }
  const novo = proximoStatusDaSecao(s.status, acao);
  if (!novo) return { ok: false, reason: 'ESTADO', message: acao === 'separar' ? 'Este setor já está em separação.' : 'Este setor já foi atendido.' };
  const agora = new Date();
  const dados = novo === 'EM_SEPARACAO'
    ? { status: novo, receivedById: user.id, receivedByName: user.name, receivedAt: agora }
    : { status: novo, attendedById: user.id, attendedByName: user.name, attendedAt: agora, ...(s.status === 'ENVIADO' ? { receivedById: user.id, receivedByName: user.name, receivedAt: agora } : {}) };
  await prisma.sectorOrderSection.update({ where: { id: sectionId }, data: dados });
  const todas = await prisma.sectorOrderSection.findMany({ where: { orderId: s.orderId }, select: { status: true } });
  const statusPedido = statusDoPedido(todas.map((x) => x.status));
  await prisma.sectorOrder.update({ where: { id: s.orderId }, data: { status: statusPedido, attendedAt: statusPedido === 'ATENDIDO' ? agora : null } });
  await audit({ userId: user.id, unitId: s.order.unitId, action: acao === 'separar' ? 'ORDER_SECTION_SEPARATING' : 'ORDER_SECTION_ATTENDED', module: 'ORDERS', entity: 'sector_order_section', entityId: sectionId, metadata: { number: s.order.number, setor: s.sectorName, destino: s.destination, de: s.status, para: novo, pedido: statusPedido }, ...ctx });
  if (s.order.createdById && novo === 'ATENDIDO') {
    await notifyUsers([s.order.createdById], {
      title: statusPedido === 'ATENDIDO' ? `Pedido nº ${s.order.number} atendido` : `Pedido nº ${s.order.number}: ${s.sectorName} atendido`,
      body: `${user.name} atendeu ${s.sectorName} (${rotuloDoDestino(s.destination)})${statusPedido === 'ATENDIDO' ? ' — todos os setores do pedido foram atendidos.' : '.'}`,
      link: LINK_ENVIADOS, module: 'ORDERS',
    }).catch(() => {});
  }
  return { ok: true, id: s.orderId, number: s.order.number };
}
