import { prisma } from '@/lib/db/prisma';
import { notifyUnitRole } from '@/lib/notifications';
import { MAX_TEXT_LEN, type FormFieldView, type SubmissionAnswer } from '@/lib/checklist-forms/types';
import type { Role, Prisma } from '@prisma/client';

const THROTTLE_MS = 8000; // 1 envio a cada ~8s por IP+ficha (anti-spam básico)

/* ───────── Leitura pública (exposição mínima) ───────── */

export interface PublicChecklist {
  title: string;
  description: string | null;
  unitName: string;
  fields: FormFieldView[];
  collaborators: { id: string; name: string }[];
}

function toOptions(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map((o) => String(o)).filter(Boolean) : [];
}

/**
 * Dados para renderizar a página pública de uma ficha. Devolve APENAS o necessário
 * (estrutura da ficha + nome da unidade + funcionários da unidade). Null se o link
 * não vale (token errado, ficha inativa, link desligado, expirado ou unidade inativa).
 */
export async function getPublicChecklist(token: string): Promise<PublicChecklist | null> {
  if (!token) return null;
  const t = await prisma.taskTemplate.findFirst({
    where: { publicToken: token, deliveryMode: 'LINK', active: true, linkEnabled: true },
    include: { items: { orderBy: { order: 'asc' } }, unit: { select: { id: true, name: true, active: true } } },
  });
  if (!t || !t.unit.active) return null;
  if (t.expiresAt && t.expiresAt.getTime() < Date.now()) return null;

  const collaborators = await prisma.collaborator.findMany({
    where: { active: true, units: { some: { unitId: t.unitId } } },
    orderBy: { name: 'asc' }, select: { id: true, name: true },
  });

  return {
    title: t.name,
    description: t.description,
    unitName: t.unit.name,
    fields: t.items.map((i) => ({ id: i.id, kind: i.fieldKind, label: i.text, section: i.section, required: i.required, options: toOptions(i.options), order: i.order })),
    collaborators,
  };
}

/* ───────── Envio (público) ───────── */

export type SubmitInput = {
  token: string;
  collaboratorId: string;
  answers: Record<string, unknown>;
  honeypot?: string; // campo oculto anti-bot
  ip?: string | null;
  userAgent?: string | null;
};
export type SubmitResult = { ok: true } | { ok: false; reason: 'NOT_FOUND' | 'INVALID' | 'THROTTLED'; detail?: string };

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

export async function submitChecklist(input: SubmitInput): Promise<SubmitResult> {
  // Honeypot: bot preencheu o campo oculto → finge sucesso e descarta.
  if (input.honeypot && input.honeypot.trim() !== '') return { ok: true };

  const t = await prisma.taskTemplate.findFirst({
    where: { publicToken: input.token, deliveryMode: 'LINK', active: true, linkEnabled: true },
    include: { items: { orderBy: { order: 'asc' } }, unit: { select: { active: true, name: true } } },
  });
  if (!t || !t.unit.active) return { ok: false, reason: 'NOT_FOUND' };
  if (t.expiresAt && t.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'NOT_FOUND' };

  // Funcionário: precisa ser da unidade da ficha (R6).
  const collab = await prisma.collaborator.findFirst({
    where: { id: input.collaboratorId, active: true, units: { some: { unitId: t.unitId } } },
    select: { id: true, name: true },
  });
  if (!collab) return { ok: false, reason: 'INVALID', detail: 'Selecione o seu nome na lista.' };

  // Throttle por IP+ficha e teto diário opcional.
  if (input.ip) {
    const recent = await prisma.checklistSubmission.count({ where: { templateId: t.id, ip: input.ip, createdAt: { gte: new Date(Date.now() - THROTTLE_MS) } } });
    if (recent > 0) return { ok: false, reason: 'THROTTLED', detail: 'Aguarde alguns segundos antes de enviar de novo.' };
  }
  if (t.maxPerDay > 0) {
    const startOfDay = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
    const today = await prisma.checklistSubmission.count({ where: { templateId: t.id, createdAt: { gte: startOfDay } } });
    if (today >= t.maxPerDay) return { ok: false, reason: 'THROTTLED', detail: 'Limite de envios de hoje atingido para esta ficha.' };
  }

  // Monta o snapshot das respostas, validando por tipo.
  const answers: SubmissionAnswer[] = [];
  for (const item of t.items) {
    if (item.fieldKind === 'SECTION') continue;
    const raw = input.answers?.[item.id];
    if (isEmpty(raw)) {
      if (item.required) return { ok: false, reason: 'INVALID', detail: `Preencha: ${item.text}` };
      answers.push({ itemId: item.id, label: item.text, kind: item.fieldKind, value: null });
      continue;
    }
    let value: string | number | boolean | null;
    if (item.fieldKind === 'NUMBER') {
      const n = Number(raw);
      if (!Number.isFinite(n)) return { ok: false, reason: 'INVALID', detail: `Número inválido em: ${item.text}` };
      value = n;
    } else if (item.fieldKind === 'BOOLEAN') {
      value = raw === true || raw === 'true' || raw === 'on' || raw === 1 || raw === '1';
    } else if (item.fieldKind === 'SELECT') {
      const opts = toOptions(item.options);
      const s = String(raw);
      if (!opts.includes(s)) return { ok: false, reason: 'INVALID', detail: `Opção inválida em: ${item.text}` };
      value = s;
    } else {
      value = String(raw).trim().slice(0, MAX_TEXT_LEN); // SHORT_TEXT, TEXTAREA, TIME, DATE
    }
    answers.push({ itemId: item.id, label: item.text, kind: item.fieldKind, value });
  }

  await prisma.checklistSubmission.create({
    data: {
      templateId: t.id, unitId: t.unitId, collaboratorId: collab.id, respondentName: collab.name,
      answers: answers as unknown as Prisma.InputJsonValue,
      ip: input.ip ?? null, userAgent: input.userAgent?.slice(0, 300) ?? null,
    },
  });

  if (t.notifyRole) {
    await notifyUnitRole(t.unitId, t.notifyRole as Role, {
      title: `📝 Ficha preenchida: ${t.name}`,
      body: `${collab.name} preencheu "${t.name}" em ${t.unit.name}.`,
      link: '/tarefas/fichas', module: 'TASKS', critical: false,
    }).catch(() => {});
  }
  return { ok: true };
}
