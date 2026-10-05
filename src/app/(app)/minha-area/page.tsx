import { getSessionUser } from '@/lib/auth/session';
import { listManagerTasks, listManagerNotes, listManagerLeaves } from '@/lib/manager-area';
import { getMyWorkSchedule } from '@/lib/manager-schedule';
import { permissoesEfetivasDoRequest } from '@/lib/permissions';
import { acessoDasAbas } from '@/lib/permissions/manager-area';
import { ManagerAreaClient } from '@/components/manager-area/manager-area-client';

export const dynamic = 'force-dynamic';

export default async function MinhaAreaPage() {
  const user = (await getSessionUser())!;
  const [tasks, notes, leaves, schedule, perms] = await Promise.all([
    listManagerTasks(user.id),
    listManagerNotes(user.id),
    listManagerLeaves(user.id),
    getMyWorkSchedule(user.id),
    permissoesEfetivasDoRequest(user.role),
  ]);
  const canSeeTeam = Boolean(perms.LEAVES_TEAM?.canView);
  const abas = acessoDasAbas(perms);

  return (
    <div className="space-y-4">
      <div>
        {/* O cabeçalho (título + abas) vive no cliente, no padrão do kit. */}
      </div>
        <ManagerAreaClient
          subtitulo="Sua agenda pessoal, bloco de notas e folgas/férias."
          tasks={tasks.map((t) => ({ id: t.id, title: t.title, notes: t.notes, dueAt: t.dueAt ? t.dueAt.toISOString() : null, done: t.done }))}
          notes={notes.map((n) => ({ id: n.id, title: n.title, content: n.content, createdAt: n.createdAt.toISOString() }))}
          leaves={leaves.map((l) => ({ id: l.id, kind: l.kind, startDate: l.startDate, endDate: l.endDate, note: l.note }))}
          schedule={schedule}
          canSeeTeam={canSeeTeam}
          abas={abas}
        />
    </div>
  );
}
