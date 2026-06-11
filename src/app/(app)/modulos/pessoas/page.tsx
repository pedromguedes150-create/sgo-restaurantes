import { getSessionUser } from '@/lib/auth/session';
import { listCollaborators, listVacations, listSchedule } from '@/lib/people';
import { Card, CardContent } from '@/components/ui/card';
import { PeopleClient } from '@/components/people/people-client';

export const dynamic = 'force-dynamic';

function d(date: Date) { return new Date(date).toLocaleDateString('pt-BR'); }

export default async function PessoasModulePage() {
  const user = (await getSessionUser())!;
  const [collaborators, vacations, schedule] = await Promise.all([listCollaborators(user), listVacations(user), listSchedule(user)]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-brand">Gestão de Pessoas</h1>
      <p className="text-sm text-muted-foreground">Fonte primária: API do RH · fallback manual. Escala é somente leitura (registre variações).</p>
      <Card>
        <CardContent className="pt-4">
          <PeopleClient
            collaborators={collaborators.map((c) => ({ id: c.id, name: c.name, jobTitle: c.jobTitle, units: c.units.map((u) => u.unit.name) }))}
            vacations={vacations.map((v) => ({ id: v.id, collaborator: v.collaborator.name, unit: v.unit.name, start: d(v.startDate), end: d(v.endDate), status: v.status, changeNote: v.changeNote }))}
            schedule={schedule.map((s) => ({ id: s.id, collaborator: s.collaborator.name, unit: s.unit.name, date: d(s.date), planned: s.planned, variation: s.variation, note: s.variationNote }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
