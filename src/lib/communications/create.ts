import { prisma } from '@/lib/db/prisma';
import { audit } from '@/lib/audit';
import { notifyUsers } from '@/lib/notifications';
import type { SessionUser } from '@/lib/auth/session';
import type { CommunicationPriority } from '@prisma/client';

export const COMM_AUTHOR_ROLES = ['ADMIN', 'CEO', 'SUPERVISOR'] as const;
export function canAuthorCommunications(user: SessionUser): boolean {
  return (COMM_AUTHOR_ROLES as readonly string[]).includes(user.role);
}

export interface CommLink { label: string; url: string }
export interface CreateCommunicationInput {
  title: string;
  body: string;
  priority?: CommunicationPriority;
  pinned?: boolean;
  requiresResponse?: boolean;
  links?: CommLink[];
  dueAt: string;
  unitIds?: string[];
  extraUserIds?: string[];
  attachments?: { path: string; mimeType: string; name?: string }[];
}

export type CreateResult =
  | { ok: true; id: string; recipients: number }
  | { ok: false; reason: 'FORBIDDEN' | 'INVALID' | 'NO_RECIPIENTS' };

type Ctx = { ip?: string | null; userAgent?: string | null };

/**
 * Cria um comunicado e resolve os destinatários (snapshot): gerentes das
 * unidades-alvo + destinatários avulsos. Notifica todos in-app.
 */
export async function createCommunication(user: SessionUser, input: CreateCommunicationInput, ctx: Ctx = {}): Promise<CreateResult> {
  if (!canAuthorCommunications(user)) return { ok: false, reason: 'FORBIDDEN' };
  const title = input.title?.trim();
  const body = input.body?.trim();
  if (!title || !body || !input.dueAt) return { ok: false, reason: 'INVALID' };
  const due = new Date(input.dueAt);
  if (Number.isNaN(due.getTime())) return { ok: false, reason: 'INVALID' };

  // Supervisor só mira as próprias unidades; ADMIN/CEO miram qualquer.
  let unitIds = [...new Set((input.unitIds ?? []).filter(Boolean))];
  if (!user.seesAllUnits) unitIds = unitIds.filter((u) => user.unitIds.includes(u));

  const links = (input.links ?? []).filter((l) => l?.url?.trim()).map((l) => ({ label: l.label?.trim() || l.url.trim(), url: l.url.trim() }));

  // Resolve destinatários: gerentes das unidades + avulsos. Mapa userId -> unitId (p/ meta).
  const recip = new Map<string, string | null>();
  if (unitIds.length) {
    const managers = await prisma.user.findMany({
      where: { role: 'MANAGER', active: true, memberships: { some: { unitId: { in: unitIds } } } },
      select: { id: true, memberships: { where: { unitId: { in: unitIds } }, select: { unitId: true } } },
    });
    for (const m of managers) recip.set(m.id, m.memberships[0]?.unitId ?? null);
  }
  const extraIds = [...new Set((input.extraUserIds ?? []).filter(Boolean))];
  if (extraIds.length) {
    const extras = await prisma.user.findMany({ where: { id: { in: extraIds }, active: true }, select: { id: true, memberships: { select: { unitId: true } } } });
    for (const e of extras) if (!recip.has(e.id)) recip.set(e.id, e.memberships[0]?.unitId ?? null);
  }
  if (recip.size === 0) return { ok: false, reason: 'NO_RECIPIENTS' };

  const comm = await prisma.communication.create({
    data: {
      authorId: user.id,
      title,
      body,
      priority: input.priority ?? 'NORMAL',
      pinned: Boolean(input.pinned),
      requiresResponse: Boolean(input.requiresResponse),
      links: links.length ? links : undefined,
      dueAt: due,
      units: unitIds.length ? { create: unitIds.map((unitId) => ({ unitId })) } : undefined,
      attachments: input.attachments?.length ? { create: input.attachments.map((a) => ({ path: a.path, mimeType: a.mimeType, name: a.name ?? null })) } : undefined,
      recipients: { create: [...recip.entries()].map(([userId, unitId]) => ({ userId, unitId })) },
    },
    select: { id: true },
  });

  await audit({ userId: user.id, action: 'COMMUNICATION_CREATE', module: 'COMMUNICATION', entity: 'communication', entityId: comm.id, metadata: { recipients: recip.size, units: unitIds.length, priority: input.priority ?? 'NORMAL' }, ...ctx });

  await notifyUsers([...recip.keys()], {
    title: `📣 Comunicado: ${title}`,
    body: 'Toque para ler e confirmar.',
    link: `/modulos/comunicacao/${comm.id}`,
    module: 'COMMUNICATION',
    critical: (input.priority ?? 'NORMAL') === 'URGENT',
  });

  return { ok: true, id: comm.id, recipients: recip.size };
}
