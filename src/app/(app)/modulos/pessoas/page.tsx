import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { listCollaborators, listVacations, listSchedule } from '@/lib/people';
import { Card, CardContent } from '@/components/ui/card';
import { PeopleClient } from '@/components/people/people-client';
import { Grid3x3, CalendarDays, Stethoscope, UserMinus, UserCheck, Star } from 'lucide-react';

export const dynamic = 'force-dynamic';

function d(date: Date) { return new Date(date).toLocaleDateString('pt-BR'); }

export default async function PessoasModulePage() {
  const user = (await getSessionUser())!;
  const [collaborators, vacations, schedule] = await Promise.all([listCollaborators(user), listVacations(user), listSchedule(user)]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-brand">Gestão de Pessoas</h1>
      <p className="text-sm text-muted-foreground">Fonte primária: API do RH · fallback manual. Escala é somente leitura (registre variações).</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Link href="/modulos/escala" className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm font-semibold text-brand transition-colors hover:border-accent">
          <CalendarDays className="h-5 w-5 text-accent" /> Escala de funcionários (presença mensal)
        </Link>
        <Link href="/modulos/pessoas/mapa" className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm font-semibold text-brand transition-colors hover:border-accent">
          <Grid3x3 className="h-5 w-5 text-accent" /> Mapa de Funções (Setor × Turno)
        </Link>
        <Link href="/modulos/atestados" className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm font-semibold text-brand transition-colors hover:border-accent">
          <Stethoscope className="h-5 w-5 text-accent" /> Central de Atestados
        </Link>
        <Link href="/modulos/desligamentos" className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm font-semibold text-brand transition-colors hover:border-accent">
          <UserMinus className="h-5 w-5 text-accent" /> Desligamentos
        </Link>
        <Link href="/modulos/pessoas/experiencia" className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm font-semibold text-brand transition-colors hover:border-accent">
          <UserCheck className="h-5 w-5 text-accent" /> Período de Experiência (≤90 dias)
        </Link>
        <Link href="/modulos/pessoas/avaliacao" className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm font-semibold text-brand transition-colors hover:border-accent">
          <Star className="h-5 w-5 text-accent" /> Avaliação do colaborador
        </Link>
      </div>
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
