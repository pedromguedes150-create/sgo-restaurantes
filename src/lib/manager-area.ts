import { prisma } from '@/lib/db/prisma';
import { notifyUsers } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';
import type { ManagerLeaveKind } from '@prisma/client';

/* ───────────────────────── Tarefas pessoais ───────────────────────── */
export async function listManagerTasks(userId: string) {
  return prisma.managerTask.findMany({ where: { userId }, orderBy: [{ done: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }], take: 200 });
}
export async function createManagerTask(user: SessionUser, input: { title: string; notes?: string; dueAt?: string }) {
  if (!input.title?.trim()) return { ok: false as const, reason: 'INVALID' as const };
  const dueAt = input.dueAt ? new Date(input.dueAt) : null;
  const t = await prisma.managerTask.create({ data: { userId: user.id, title: input.title.trim(), notes: input.notes?.trim() || null, dueAt: dueAt && !isNaN(dueAt.getTime()) ? dueAt : null } });
  return { ok: true as const, id: t.id };
}
export async function toggleManagerTask(user: SessionUser, id: string, done: boolean) {
  const t = await prisma.managerTask.findUnique({ where: { id }, select: { userId: true } });
  if (!t || t.userId !== user.id) return { ok: false as const, reason: 'FORBIDDEN' as const };
  await prisma.managerTask.update({ where: { id }, data: { done, doneAt: done ? new Date() : null } });
  return { ok: true as const };
}
export async function deleteManagerTask(user: SessionUser, id: string) {
  const t = await prisma.managerTask.findUnique({ where: { id }, select: { userId: true } });
  if (!t || t.userId !== user.id) return { ok: false as const, reason: 'FORBIDDEN' as const };
  await prisma.managerTask.delete({ where: { id } });
  return { ok: true as const };
}

/* ───────────────────────── Bloco de notas ───────────────────────── */
export async function listManagerNotes(userId: string) {
  return prisma.managerNote.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 200 });
}
export async function addManagerNote(user: SessionUser, content: string) {
  if (!content?.trim()) return { ok: false as const, reason: 'INVALID' as const };
  const n = await prisma.managerNote.create({ data: { userId: user.id, content: content.trim() } });
  return { ok: true as const, id: n.id };
}
export async function deleteManagerNote(user: SessionUser, id: string) {
  const n = await prisma.managerNote.findUnique({ where: { id }, select: { userId: true } });
  if (!n || n.userId !== user.id) return { ok: false as const, reason: 'FORBIDDEN' as const };
  await prisma.managerNote.delete({ where: { id } });
  return { ok: true as const };
}

/* ───────────────────────── Folgas / férias ───────────────────────── */
export async function listManagerLeaves(userId: string) {
  return prisma.managerLeave.findMany({ where: { userId }, orderBy: { startDate: 'desc' }, take: 200 });
}
export async function addManagerLeave(user: SessionUser, input: { kind: ManagerLeaveKind; startDate: string; endDate: string; note?: string }) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(input.startDate) || !re.test(input.endDate) || input.endDate < input.startDate) return { ok: false as const, reason: 'INVALID' as const };
  const kind: ManagerLeaveKind = input.kind === 'FERIAS' ? 'FERIAS' : 'FOLGA';
  const l = await prisma.managerLeave.create({ data: { userId: user.id, kind, startDate: input.startDate, endDate: input.endDate, note: input.note?.trim() || null } });
  return { ok: true as const, id: l.id };
}
export async function deleteManagerLeave(user: SessionUser, id: string) {
  const l = await prisma.managerLeave.findUnique({ where: { id }, select: { userId: true } });
  if (!l || l.userId !== user.id) return { ok: false as const, reason: 'FORBIDDEN' as const };
  await prisma.managerLeave.delete({ where: { id } });
  return { ok: true as const };
}
/** Folga/férias do usuário cobrindo a data (yyyy-mm-dd), se houver. */
export async function leaveOnDate(userId: string, dateISO: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return null;
  return prisma.managerLeave.findFirst({ where: { userId, startDate: { lte: dateISO }, endDate: { gte: dateISO } }, select: { kind: true, startDate: true, endDate: true } });
}

/* ───────────────────────── Lembretes (scheduler) ───────────────────────── */
/** Notifica o dono de tarefas pessoais vencidas ainda não avisadas. Idempotente. */
export async function notifyDueManagerTasks(): Promise<number> {
  const now = new Date();
  const due = await prisma.managerTask.findMany({ where: { done: false, notifiedAt: null, dueAt: { not: null, lte: now } }, take: 200 });
  let n = 0;
  for (const t of due) {
    await notifyUsers([t.userId], { title: '⏰ Lembrete de tarefa', body: t.title, link: '/minha-area', module: 'DASHBOARD' });
    await prisma.managerTask.update({ where: { id: t.id }, data: { notifiedAt: now } });
    n++;
  }
  return n;
}
