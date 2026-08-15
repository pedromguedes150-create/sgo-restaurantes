import { getSessionUser } from '@/lib/auth/session';
import { listManagerTasks, listManagerNotes, listManagerLeaves } from '@/lib/manager-area';
import { getMyWorkSchedule } from '@/lib/manager-schedule';
import { effectivePermissions } from '@/lib/permissions';
import { Card, CardContent } from '@/components/ui/card';
import { ManagerAreaClient } from '@/components/manager-area/manager-area-client';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

export default async function MinhaAreaPage() {
  const user = (await getSessionUser())!;
  const [tasks, notes, leaves, schedule, perms] = await Promise.all([
    listManagerTasks(user.id),
    listManagerNotes(user.id),
    listManagerLeaves(user.id),
    getMyWorkSchedule(user.id),
    effectivePermissions(user.role),
  ]);
  const canSeeTeam = Boolean(perms.LEAVES_TEAM?.canView);

  return (
    <div className="space-y-4">
      <div>
        <LargeTitle title="Minha área" subtitle="Sua agenda pessoal, bloco de notas e folgas/férias." />
      </div>
      <Card><CardContent className="pt-4">
        <ManagerAreaClient
          tasks={tasks.map((t) => ({ id: t.id, title: t.title, notes: t.notes, dueAt: t.dueAt ? t.dueAt.toISOString() : null, done: t.done }))}
          notes={notes.map((n) => ({ id: n.id, title: n.title, content: n.content, createdAt: n.createdAt.toISOString() }))}
          leaves={leaves.map((l) => ({ id: l.id, kind: l.kind, startDate: l.startDate, endDate: l.endDate, note: l.note }))}
          schedule={schedule}
          canSeeTeam={canSeeTeam}
        />
      </CardContent></Card>
    </div>
  );
}
