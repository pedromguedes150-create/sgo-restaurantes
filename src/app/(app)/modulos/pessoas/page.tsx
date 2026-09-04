import { getSessionUser } from '@/lib/auth/session';
import { permissaoDeRota } from '@/lib/permissions/links';

import { FamilyTabs } from '@/components/layout/family-tabs';
import { listCollaborators, listVacations, listSchedule } from '@/lib/people';
import { Card, CardContent } from '@/components/ui/card';
import { PeopleClient } from '@/components/people/people-client';
import { LargeTitle } from '@/components/layout/page-chrome';
import { List, ListRow } from '@/components/ui/ds/list-row';
import { Grid3x3, CalendarDays, Stethoscope, UserMinus, UserCheck, Star, ArrowRightLeft, HandCoins } from 'lucide-react';

export const dynamic = 'force-dynamic';

const DESTINOS = [
  { href: '/modulos/escala', icon: CalendarDays, title: 'Escala de funcionários', subtitle: 'Presença mensal, planejado × realizado' },
  { href: '/modulos/pessoas/mapa', icon: Grid3x3, title: 'Mapa de Funções', subtitle: 'Setor × turno, alocação do dia' },
  { href: '/modulos/atestados', icon: Stethoscope, title: 'Central de Atestados', subtitle: 'Lançar por foto, absenteísmo e ranking' },
  { href: '/modulos/desligamentos', icon: UserMinus, title: 'Desligamentos', subtitle: 'Solicitar, aprovar e enviar ao RH' },
  { href: '/modulos/pessoas/experiencia', icon: UserCheck, title: 'Período de Experiência', subtitle: 'Avaliações dentro dos 90 dias' },
  { href: '/modulos/pessoas/avaliacao', icon: Star, title: 'Avaliação do colaborador', subtitle: 'Observações e nota mensal' },
  { href: '/modulos/pessoas/mudancas', icon: ArrowRightLeft, title: 'Mudanças de função/setor', subtitle: 'Solicitações enviadas ao RH' },
  { href: '/modulos/pessoas/comissoes', icon: HandCoins, title: 'Comissões & Mobilidade', subtitle: 'Lançamentos e tendência do mês' },
];

function d(date: Date) { return new Date(date).toLocaleDateString('pt-BR'); }

export default async function PessoasModulePage() {
  const user = (await getSessionUser())!;
  /* Cartão de tela que o perfil não pode abrir não é oferecido — clicar nele
     só devolveria a pessoa para onde ela estava. */
  const podeVer = await permissaoDeRota(user.role);
  const [collaborators, vacations, schedule] = await Promise.all([listCollaborators(user), listVacations(user), listSchedule(user)]);

  return (
    <div className="space-y-4">
      <LargeTitle
        title="Gestão de Pessoas"
        subtitle="Fonte primária: API do RH · fallback manual. Escala é somente leitura (registre variações)."
      />
      <FamilyTabs active="/modulos/pessoas" />

      {/* Destinos do módulo: uma lista em duas colunas, com o subtítulo dizendo
          o que cada tela resolve — antes eram 8 blocos só com o nome. */}
      {/* Destinos do módulo numa lista só, com o subtítulo dizendo o que cada
          tela resolve — antes eram 8 blocos soltos só com o nome. */}
      <List>
        {DESTINOS.filter((x) => podeVer(x.href)).map((d) => (
          <ListRow
            key={d.href}
            href={d.href}
            title={d.title}
            subtitle={d.subtitle}
            leading={<d.icon className="h-8 w-8 shrink-0 rounded-control bg-sunken p-2 text-ink-500" />}
          />
        ))}
      </List>
      <Card>
        <CardContent className="pt-4">
          <PeopleClient
            canRequestVacation={user.role !== 'FINANCE' && user.role !== 'CEO'}
            collaborators={collaborators.map((c) => ({ id: c.id, name: c.name, jobTitle: c.jobTitle, units: c.units.map((u) => u.unit.name) }))}
            vacations={vacations.map((v) => ({ id: v.id, collaborator: v.collaborator.name, unit: v.unit.name, start: d(v.startDate), end: d(v.endDate), status: v.status, changeNote: v.changeNote }))}
            schedule={schedule.map((s) => ({ id: s.id, collaborator: s.collaborator.name, unit: s.unit.name, date: d(s.date), planned: s.planned, variation: s.variation, note: s.variationNote }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
