import { prisma } from '@/lib/db/prisma';
import { getUsageBoard } from '@/lib/supervisor/usage';
import { ROLE_LABELS } from '@/lib/roles';
import type { SessionUser } from '@/lib/auth/session';
import type { Role } from '@prisma/client';
import { resumirUso, type ResumoDoUso, type UnidadeUso, type UsuarioUso } from '@/lib/metas/uso-calculo';

/**
 * USO DO SGO — leitura no servidor (v1.164.0). Por unidade: o painel de uso
 * do supervisor (`getUsageBoard`, a mesma conta) + tarefas por situação +
 * ações da Auditoria. Por usuário (gerente, coordenador e supervisor das
 * unidades do alcance): acessos (LOGIN), ações (Auditoria sem AUTH), módulos
 * tocados, tarefas concluídas no prazo e fora dele, último acesso.
 * Escopo por unidade SEMPRE no where. Só leitura.
 */
export const PERFIS_MEDIDOS: Role[] = ['MANAGER', 'COORDINATOR', 'SUPERVISOR'];

export interface UsoDoSgo { yearMonth: string; unidades: UnidadeUso[]; usuarios: UsuarioUso[]; resumo: ResumoDoUso }

function limites(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return { inicio: new Date(Date.UTC(y, m - 1, 1)), fim: new Date(Date.UTC(y, m, 1)) };
}

export async function getUsoDoSgo(user: SessionUser, yearMonth: string): Promise<UsoDoSgo> {
  const board = await getUsageBoard(user, yearMonth);
  const unitIds = board.map((u) => u.unitId);
  const { inicio, fim } = limites(yearMonth);

  const [tarefasPorUnidade, membros, usuarios] = await Promise.all([
    prisma.taskInstance.groupBy({ by: ['unitId', 'status'], where: { unitId: { in: unitIds }, operationalDate: { startsWith: yearMonth }, status: { in: ['DONE', 'LATE', 'MISSED'] } }, _count: { _all: true } }),
    prisma.unitMembership.findMany({ where: { unitId: { in: unitIds } }, select: { userId: true, unitId: true, unit: { select: { name: true } } } }),
    prisma.user.findMany({ where: { active: true, role: { in: PERFIS_MEDIDOS }, memberships: { some: { unitId: { in: unitIds } } } }, select: { id: true, name: true, role: true, lastLoginAt: true }, orderBy: { name: 'asc' } }),
  ]);
  const userIds = usuarios.map((u) => u.id);

  const [acoesPorUnidadeUsuario, acoesPorUsuarioModulo, logins, tarefasPorUsuario] = await Promise.all([
    prisma.auditLog.groupBy({ by: ['unitId', 'userId'], where: { unitId: { in: unitIds }, createdAt: { gte: inicio, lt: fim }, NOT: { module: 'AUTH' } }, _count: { _all: true } }),
    prisma.auditLog.groupBy({ by: ['userId', 'module'], where: { userId: { in: userIds }, createdAt: { gte: inicio, lt: fim }, NOT: { module: 'AUTH' } }, _count: { _all: true } }),
    prisma.auditLog.groupBy({ by: ['userId'], where: { userId: { in: userIds }, action: 'LOGIN', createdAt: { gte: inicio, lt: fim } }, _count: { _all: true } }),
    prisma.taskInstance.groupBy({ by: ['completedById', 'status'], where: { unitId: { in: unitIds }, operationalDate: { startsWith: yearMonth }, status: { in: ['DONE', 'LATE'] }, completedById: { in: userIds } }, _count: { _all: true } }),
  ]);

  const n = (rows: { unitId: string | null; status: string; _count: { _all: number } }[], unitId: string, status: string) => rows.find((r) => r.unitId === unitId && r.status === status)?._count._all ?? 0;
  const unidades: UnidadeUso[] = board.map((b) => {
    const acoesDaUnidade = acoesPorUnidadeUsuario.filter((a) => a.unitId === b.unitId);
    return {
      unitId: b.unitId, unitName: b.unitName,
      usagePct: b.usagePct, checklistPct: b.checklistPct, wastePct: b.wastePct, commandsPct: b.commandsPct, metaPct: b.metaPct,
      done: n(tarefasPorUnidade, b.unitId, 'DONE'), late: n(tarefasPorUnidade, b.unitId, 'LATE'), missed: n(tarefasPorUnidade, b.unitId, 'MISSED'),
      acoes: acoesDaUnidade.reduce((s, a) => s + a._count._all, 0),
      usuariosAtivos: new Set(acoesDaUnidade.filter((a) => a.userId).map((a) => a.userId)).size,
      usuariosVinculados: new Set(membros.filter((m) => m.unitId === b.unitId && userIds.includes(m.userId)).map((m) => m.userId)).size,
      occurrences: b.occurrences, notes: b.notes,
    };
  });

  const usuariosUso: UsuarioUso[] = usuarios.map((u) => {
    const mods = acoesPorUsuarioModulo.filter((a) => a.userId === u.id);
    const acoes = mods.reduce((s, a) => s + a._count._all, 0);
    const modulos = [...mods].sort((a, b) => b._count._all - a._count._all).map((a) => a.module ?? 'GERAL').filter((m, i, arr) => arr.indexOf(m) === i);
    return {
      userId: u.id, name: u.name, role: u.role, roleLabel: ROLE_LABELS[u.role] ?? u.role,
      unidades: membros.filter((m) => m.userId === u.id).map((m) => m.unit.name).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      acessos: logins.find((l) => l.userId === u.id)?._count._all ?? 0,
      acoes, modulos,
      tarefasConcluidas: tarefasPorUsuario.find((t) => t.completedById === u.id && t.status === 'DONE')?._count._all ?? 0,
      foraDoPrazo: tarefasPorUsuario.find((t) => t.completedById === u.id && t.status === 'LATE')?._count._all ?? 0,
      ultimoAcesso: u.lastLoginAt?.toISOString() ?? null,
    };
  }).sort((a, b) => b.acoes - a.acoes || b.tarefasConcluidas - a.tarefasConcluidas || a.name.localeCompare(b.name, 'pt-BR'));

  return { yearMonth, unidades: [...unidades].sort((a, b) => b.usagePct - a.usagePct || b.acoes - a.acoes), usuarios: usuariosUso, resumo: resumirUso(unidades, usuariosUso) };
}
