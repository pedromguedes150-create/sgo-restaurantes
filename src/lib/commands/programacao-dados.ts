import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { currentOperationalDate } from '@/lib/date/operational';
import type { SessionUser } from '@/lib/auth/session';
import {
  escolherProgramacao, normalizarProgramacao, normalizarExcecao, trechosForaDoCadastro,
  type Programacao, type Excecao, type ProgramacaoDoDia, type TipoProgramado, type EntradaDeProgramacao,
} from '@/lib/commands/programacao';

/** Hora local (0–23) de um instante no fuso da unidade. */
export function horaLocal(agora: Date, timezone: string): number {
  const h = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: timezone }).format(agora);
  return Number(h) % 24;
}

const dePrisma = (r: { id: string; name: string; type: TipoProgramado; weekdays: number[]; startHour: number | null; endHour: number | null; rangeStart: number | null; rangeEnd: number | null; priority: number; active: boolean }): Programacao => ({
  id: r.id, nome: r.name, tipo: r.type, dias: r.weekdays, inicioHora: r.startHour, fimHora: r.endHour,
  faixaDe: r.rangeStart, faixaAte: r.rangeEnd, prioridade: r.priority, ativa: r.active,
});

const excecaoDe = (r: { id: string; date: string; name: string; skip: boolean; type: TipoProgramado | null; rangeStart: number | null; rangeEnd: number | null }): Excecao => ({
  id: r.id, data: r.date, nome: r.name, semConferencia: r.skip, tipo: r.type, faixaDe: r.rangeStart, faixaAte: r.rangeEnd,
});

/** O que vale hoje (dia operacional + hora local) para a unidade. Uma consulta a mais, sem escrita. */
export async function programacaoDeHoje(unitId: string, agora: Date = new Date()): Promise<ProgramacaoDoDia & { data: string }> {
  const unit = await prisma.unit.findUnique({ where: { id: unitId }, select: { timezone: true, cutoffHour: true } });
  const vazio: ProgramacaoDoDia & { data: string } = { origem: 'PADRAO', nome: null, tipo: null, faixa: null, semConferencia: false, concorrentes: [], data: '' };
  if (!unit) return vazio;
  const data = currentOperationalDate({ timezone: unit.timezone, cutoffHour: unit.cutoffHour }, agora);
  const [progs, exc] = await Promise.all([
    prisma.commandSchedule.findMany({ where: { unitId, active: true } }),
    prisma.commandScheduleException.findUnique({ where: { unitId_date: { unitId, date: data } } }),
  ]);
  const r = escolherProgramacao({
    programacoes: progs.map(dePrisma),
    excecao: exc ? excecaoDe(exc) : null,
    data,
    hora: horaLocal(agora, unit.timezone),
  });
  return { ...r, data };
}

export async function listarProgramacao(unitId: string) {
  const cad = await cadastrados(unitId);
  const [progs, exc] = await Promise.all([
    prisma.commandSchedule.findMany({ where: { unitId }, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] }),
    prisma.commandScheduleException.findMany({ where: { unitId }, orderBy: { date: 'desc' }, take: 60 }),
  ]);
  return {
    programacoes: progs.map((p) => ({ ...dePrisma(p), foraDoCadastro: p.type === 'FAIXA_DO_DIA' && p.rangeStart !== null && p.rangeEnd !== null ? trechosForaDoCadastro(p.rangeStart, p.rangeEnd, cad) : [] })),
    excecoes: exc.map(excecaoDe),
  };
}

/**
 * A faixa para oferecer "conferência parcial" quando a programação de HOJE é completa
 * (v1.204.0): o gerente escolhe — completa ou parcial — sem depender do dia. É a
 * faixa da programação ativa de maior prioridade (a mais antiga no empate), limitada
 * ao cadastro; sem programação de faixa, vazio.
 */
export async function faixaAlternativa(unitId: string, cadastro: Set<number>): Promise<number[]> {
  const progs = await prisma.commandSchedule.findMany({
    where: { unitId, active: true, type: 'FAIXA_DO_DIA', rangeStart: { not: null }, rangeEnd: { not: null } },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    take: 1,
  });
  const p = progs[0];
  if (!p || p.rangeStart === null || p.rangeEnd === null) return [];
  return [...cadastro].filter((n) => n >= p.rangeStart! && n <= p.rangeEnd!).sort((a, b) => a - b);
}

type Falha = { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NAO_ENCONTRADA' | 'JA_EXISTE'; detalhe?: string };
const soAdmin = (u: SessionUser) => u.role === 'ADMIN' || u.role === 'CEO';

async function cadastrados(unitId: string): Promise<Set<number>> {
  const seqs = await prisma.commandSequence.findMany({ where: { unitId, active: true }, select: { rangeStart: true, rangeEnd: true } });
  const s = new Set<number>();
  for (const q of seqs) for (let n = q.rangeStart; n <= q.rangeEnd; n++) s.add(n);
  return s;
}

/** Cria ou edita uma programação. Só Admin/CEO — é regra de operação da rede. */
export async function salvarProgramacao(
  user: SessionUser,
  input: { id?: string; unitId: string; ativa?: boolean } & Record<string, unknown>,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ ok: true; id: string; foraDoCadastro: { de: number; ate: number }[] } | Falha> {
  if (!soAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const unit = await prisma.unit.findUnique({ where: { id: input.unitId }, select: { id: true } });
  if (!unit) return { ok: false, reason: 'INVALID', detalhe: 'Unidade inválida.' };
  const r = normalizarProgramacao(input as EntradaDeProgramacao, await cadastrados(unit.id));
  if (!r.ok) return { ok: false, reason: 'INVALID', detalhe: r.detalhe };
  const v = r.valor;
  const data = {
    name: v.nome, type: v.tipo, weekdays: v.dias, startHour: v.inicioHora, endHour: v.fimHora,
    rangeStart: v.faixaDe, rangeEnd: v.faixaAte, priority: v.prioridade,
    ...(input.ativa !== undefined ? { active: Boolean(input.ativa) } : {}),
  };
  let id: string;
  if (input.id) {
    const atual = await prisma.commandSchedule.findUnique({ where: { id: input.id } });
    if (!atual || atual.unitId !== unit.id) return { ok: false, reason: 'NAO_ENCONTRADA' };
    await prisma.commandSchedule.update({ where: { id: atual.id }, data });
    id = atual.id;
  } else {
    id = (await prisma.commandSchedule.create({ data: { ...data, unitId: unit.id, createdById: user.id } })).id;
  }
  await audit({ userId: user.id, unitId: unit.id, action: input.id ? 'COMMAND_SCHEDULE_UPDATE' : 'COMMAND_SCHEDULE_CREATE', module: 'COMMANDS', entity: 'command_schedule', entityId: id, metadata: { ...v }, ...ctx });
  return { ok: true, id, foraDoCadastro: v.tipo === 'FAIXA_DO_DIA' && v.faixaDe !== null && v.faixaAte !== null ? trechosForaDoCadastro(v.faixaDe, v.faixaAte, await cadastrados(unit.id)) : [] };
}

export async function alternarProgramacao(user: SessionUser, id: string, ativa: boolean, ctx: { ip?: string | null; userAgent?: string | null } = {}): Promise<{ ok: true } | Falha> {
  if (!soAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const atual = await prisma.commandSchedule.findUnique({ where: { id } });
  if (!atual) return { ok: false, reason: 'NAO_ENCONTRADA' };
  await prisma.commandSchedule.update({ where: { id }, data: { active: ativa } });
  await audit({ userId: user.id, unitId: atual.unitId, action: ativa ? 'COMMAND_SCHEDULE_ON' : 'COMMAND_SCHEDULE_OFF', module: 'COMMANDS', entity: 'command_schedule', entityId: id, metadata: { nome: atual.name }, ...ctx });
  return { ok: true };
}

export async function excluirProgramacao(user: SessionUser, id: string, ctx: { ip?: string | null; userAgent?: string | null } = {}): Promise<{ ok: true } | Falha> {
  if (!soAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const atual = await prisma.commandSchedule.findUnique({ where: { id } });
  if (!atual) return { ok: false, reason: 'NAO_ENCONTRADA' };
  await prisma.commandSchedule.delete({ where: { id } });
  await audit({ userId: user.id, unitId: atual.unitId, action: 'COMMAND_SCHEDULE_DELETE', module: 'COMMANDS', entity: 'command_schedule', entityId: id, metadata: { nome: atual.name }, ...ctx });
  return { ok: true };
}

/** Exceção por data (feriado/evento). Uma por unidade e data — salvar de novo substitui. */
export async function salvarExcecao(
  user: SessionUser,
  input: { unitId: string } & Record<string, unknown>,
  ctx: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ ok: true; id: string } | Falha> {
  if (!soAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const unit = await prisma.unit.findUnique({ where: { id: input.unitId }, select: { id: true } });
  if (!unit) return { ok: false, reason: 'INVALID', detalhe: 'Unidade inválida.' };
  const r = normalizarExcecao(input as Record<string, unknown>, await cadastrados(unit.id));
  if (!r.ok) return { ok: false, reason: 'INVALID', detalhe: r.detalhe };
  const v = r.valor;
  const dados = { name: v.nome, skip: v.semConferencia, type: v.tipo, rangeStart: v.faixaDe, rangeEnd: v.faixaAte };
  const e = await prisma.commandScheduleException.upsert({
    where: { unitId_date: { unitId: unit.id, date: v.data } },
    create: { ...dados, unitId: unit.id, date: v.data, createdById: user.id },
    update: dados,
  });
  await audit({ userId: user.id, unitId: unit.id, action: 'COMMAND_SCHEDULE_EXCEPTION_SAVE', module: 'COMMANDS', entity: 'command_schedule_exception', entityId: e.id, metadata: { ...v }, ...ctx });
  return { ok: true, id: e.id };
}

export async function excluirExcecao(user: SessionUser, id: string, ctx: { ip?: string | null; userAgent?: string | null } = {}): Promise<{ ok: true } | Falha> {
  if (!soAdmin(user)) return { ok: false, reason: 'FORBIDDEN' };
  const atual = await prisma.commandScheduleException.findUnique({ where: { id } });
  if (!atual) return { ok: false, reason: 'NAO_ENCONTRADA' };
  await prisma.commandScheduleException.delete({ where: { id } });
  await audit({ userId: user.id, unitId: atual.unitId, action: 'COMMAND_SCHEDULE_EXCEPTION_DELETE', module: 'COMMANDS', entity: 'command_schedule_exception', entityId: id, metadata: { data: atual.date, nome: atual.name }, ...ctx });
  return { ok: true };
}
