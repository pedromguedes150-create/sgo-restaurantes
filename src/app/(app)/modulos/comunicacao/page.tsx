import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getMyInbox, getAuthoredCommunications } from '@/lib/communications/query';
import { canAuthorCommunications } from '@/lib/communications/create';
import { getCommunicationWeight } from '@/lib/communications/meta';
import { Card, CardContent } from '@/components/ui/card';
import { CommunicationsClient, type InboxItem, type AuthoredItem } from '@/components/communications/communications-client';

export const dynamic = 'force-dynamic';

export default async function ComunicacaoPage() {
  const user = (await getSessionUser())!;
  const canAuthor = canAuthorCommunications(user);

  const inboxRows = await getMyInbox(user);
  const inbox: InboxItem[] = inboxRows.map((r) => ({
    recipientId: r.id,
    communicationId: r.communicationId,
    status: r.status,
    late: r.late,
    dueAt: r.communication.dueAt.toISOString(),
    title: r.communication.title,
    priority: r.communication.priority,
    pinned: r.communication.pinned,
    author: r.communication.author?.name ?? 'Sistema',
    attachments: r.communication.attachments.length,
  }));

  let units: { id: string; name: string }[] = [];
  let people: { id: string; name: string; role: string }[] = [];
  let authored: AuthoredItem[] = [];
  let weight = 0;
  if (canAuthor) {
    const [unitRows, weightVal, authoredRows] = await Promise.all([
      prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
      getCommunicationWeight(),
      getAuthoredCommunications(user),
    ]);
    units = unitRows;
    weight = weightVal;
    people = await prisma.user.findMany({
      where: { active: true, id: { not: user.id }, ...(user.seesAllUnits ? {} : { memberships: { some: { unitId: { in: user.unitIds } } } }) },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, role: true },
    });
    authored = authoredRows.map((c) => ({
      id: c.id, title: c.title, priority: c.priority, pinned: c.pinned,
      dueAt: c.dueAt.toISOString(), createdAt: c.createdAt.toISOString(),
      total: c.total, confirmed: c.confirmed, pending: c.pending,
      units: c.units.map((u) => u.unit.name),
    }));
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-brand">Central de Comunicação</h1>
        <p className="text-sm text-ink-500">Comunicados oficiais com confirmação de leitura — substitui a cobrança por WhatsApp.</p>
      </div>
      <Card><CardContent className="pt-4">
        <CommunicationsClient
          canAuthor={canAuthor}
          isAdmin={user.role === 'ADMIN'}
          weight={weight}
          units={units}
          people={people}
          inbox={inbox}
          authored={authored}
        />
      </CardContent></Card>
    </div>
  );
}
