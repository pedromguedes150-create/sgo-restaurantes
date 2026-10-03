import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { resolveUnitFilter } from '@/lib/scope/unit-filter';
import { getSelectedUnitId } from '@/lib/scope/selected-unit';
import { listScheduleTemplates } from '@/lib/schedule/templates';
import { resumoDaFolga } from '@/lib/schedule/vigencia';
import { canEditModule } from '@/lib/permissions';
import { abasDoPerfil } from '@/lib/permissions/abas-server';

import { permissaoDeRota } from '@/lib/permissions/links';

import { FamilyTabs } from '@/components/layout/family-tabs';
import { listCollaborators, countCollaborators, listVacations, listSchedule, LIMITE_DA_LISTA } from '@/lib/people';
import { Card, PanelHeader } from '@/components/sgo/panel';
import { PeopleClient } from '@/components/people/people-client';
import Link from 'next/link';
import { Grid3x3, CalendarDays, CalendarRange, Stethoscope, UserMinus, UserCheck, Star, ArrowRightLeft, HandCoins, Clock, ChevronRight, LayoutGrid } from 'lucide-react';

export const dynamic = 'force-dynamic';

const DESTINOS = [
  { href: '/modulos/escala', icon: CalendarDays, title: 'Escala de funcionários', subtitle: 'Presença mensal, planejado × realizado' },
  { href: '/modulos/escala-gerentes', icon: CalendarRange, title: 'Escala de gerentes', subtitle: 'Horário, folgas e férias de quem responde pela unidade' },
  { href: '/modulos/pessoas/mapa', icon: Grid3x3, title: 'Mapa de Funções', subtitle: 'Setor × turno, alocação do dia' },
  { href: '/modulos/atestados', icon: Stethoscope, title: 'Central de Atestados', subtitle: 'Lançar por foto, absenteísmo e ranking' },
  { href: '/modulos/desligamentos', icon: UserMinus, title: 'Desligamentos', subtitle: 'Solicitar, aprovar e enviar ao RH' },
  { href: '/modulos/pessoas/experiencia', icon: UserCheck, title: 'Período de Experiência', subtitle: 'Avaliações dentro dos 90 dias' },
  { href: '/modulos/pessoas/avaliacao', icon: Star, title: 'Avaliação do colaborador', subtitle: 'Observações e nota mensal' },
  { href: '/modulos/pessoas/mudancas', icon: ArrowRightLeft, title: 'Mudanças de função/setor', subtitle: 'Solicitações enviadas ao RH' },
  { href: '/modulos/hora-extra', icon: Clock, title: 'Hora extra', subtitle: 'Painel, solicitações e fechamento por competência' },
  { href: '/modulos/mobilidade', icon: HandCoins, title: 'Mobilidade', subtitle: 'Lançamento por competência e arquivo da administradora' },
];

function d(date: Date) { return new Date(date).toLocaleDateString('pt-BR'); }

export default async function PessoasModulePage({ searchParams }: { searchParams: { unit?: string; unidade?: string } }) {
  const user = (await getSessionUser())!;
  /* Cartão de tela que o perfil não pode abrir não é oferecido — clicar nele
     só devolveria a pessoa para onde ela estava. */
  const podeVer = await permissaoDeRota(user.role);
  /* A tela OBEDECE o seletor de unidade do cabeçalho. Sem isto o Admin via a
     rede inteira misturada — KM13, Vespasiano e Moreira na mesma lista —
     enquanto o chip lá em cima dizia uma unidade só. */
  const unidades = await prisma.unit.findMany({
    where: { active: true, ...unitScopeWhere(user, 'id') },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  const idsAcessiveis = unidades.map((u) => u.id);
  const filtro = resolveUnitFilter(searchParams, idsAcessiveis, getSelectedUnitId(idsAcessiveis));
  const doFiltro = filtro.all ? undefined : filtro.ids;

  const [collaborators, total, vacations, schedule, tipos, turnos, configs] = await Promise.all([
    listCollaborators(user, doFiltro),
    countCollaborators(user, doFiltro),
    listVacations(user, doFiltro),
    listSchedule(user, doFiltro),
    listScheduleTemplates(),
    prisma.shift.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, startTime: true, endTime: true } }),
    prisma.employeeSchedule.findMany({
      where: { active: true, endDate: null, ...unitScopeWhere(user, 'unitId') },
      orderBy: { startDate: 'desc' },
      include: { template: { select: { name: true } } },
    }),
  ]);
  const nomesFiltrados = filtro.all ? [] : unidades.filter((u) => filtro.ids.includes(u.id)).map((u) => u.name);
  /* A vigente de cada pessoa: a lista vem da mais recente para a mais antiga,
     então a primeira que aparecer é a que vale. */
  const configPorColab = new Map<string, (typeof configs)[number]>();
  for (const c of configs) if (!configPorColab.has(c.collaboratorId)) configPorColab.set(c.collaboratorId, c);

  return (
    <div className="space-y-4">
      {/* O cabeçalho (título + abas Colaboradores/Férias/Escala) vive no
          cliente, no padrão do kit; o subtítulo é o de sempre. */}
      <PeopleClient
        subtitulo={(
          <>
            Fonte primária: API do RH · fallback manual. Escala é somente leitura (registre variações).
            <span className="block"><FamilyTabs active="/modulos/pessoas" /></span>
          </>
        )}
        ferramentas={(
          /* Destinos do módulo (kit: painel com linhas em duas colunas, cápsula
             de ícone e o subtítulo dizendo o que cada tela resolve). */
          <Card data-testid="ferramentas-de-pessoas">
            <PanelHeader title="Ferramentas de Pessoas" icon={<span className="sgo-panel__ic sgo-panel__ic--brand" aria-hidden><LayoutGrid className="h-4 w-4" /></span>} count={DESTINOS.filter((x) => podeVer(x.href)).length} />
            <div className="grid grid-cols-1 gap-1 p-2 md:grid-cols-2">
              {DESTINOS.filter((x) => podeVer(x.href)).map((d) => (
                <Link key={d.href} href={d.href} className="sgo-row group min-h-12 outline-none focus-visible:shadow-sgo-focus" style={{ borderTop: 0 }}>
                  <span className="sgo-ric sgo-ric--blue" aria-hidden><d.icon className="h-4 w-4" /></span>
                  <span className="sgo-row__main">
                    <span className="sgo-row__title block">{d.title}</span>
                    <span className="sgo-row__sub block">{d.subtitle}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-sgo-1 ease-sgo-std group-hover:translate-x-0.5" style={{ color: 'var(--sgo-ink-3)' }} aria-hidden />
                </Link>
              ))}
            </div>
          </Card>
        )}
        abas={await abasDoPerfil(user.role, 'PEOPLE')}
        canRequestVacation={user.role !== 'FINANCE' && user.role !== 'CEO'}
        collaborators={collaborators.map((c) => ({ id: c.id, name: c.name, jobTitle: c.jobTitle, units: c.units.map((u) => u.unit.name), unitIds: c.units.map((u) => u.unit.id) }))}
        unidades={unidades}
        tipos={tipos.map((t) => ({ id: t.id, name: t.name, workDays: t.workDays, offDays: t.offDays, startTime: t.startTime, breakTime: t.breakTime, endTime: t.endTime }))}
        turnos={turnos}
        configs={Object.fromEntries([...configPorColab].map(([id, c]) => [id, {
              tipo: c.template?.name ?? null,
              folga: resumoDaFolga(c.offMode, c.weeklyOffDay, c.sundayOfMonth),
              desde: d(c.startDate),
              horario: c.startTime && c.endTime ? `${c.startTime}–${c.endTime}` : null,
              atual: {
                templateId: c.templateId, offMode: c.offMode, weeklyOffDay: c.weeklyOffDay,
                sundayOfMonth: c.sundayOfMonth, shiftId: c.shiftId,
                startTime: c.startTime, breakTime: c.breakTime, endTime: c.endTime,
              },
            }]))}
        filtradoPor={nomesFiltrados}
        total={total}
        limite={LIMITE_DA_LISTA}
        /* Cadastrar escala é ato de gestão: quem só consulta Pessoas não abre a folha. */
        podeConfigurar={await canEditModule(user.role, 'SCHEDULE')}
        /* Corrigir a quais unidades o colaborador está ligado é só do Admin: o
               sync do RH só ADICIONA vínculo (nunca remove, de propósito — ver
               src/lib/admin.ts setCollaboratorUnits), e um vínculo antigo que
               sobra depois de uma transferência precisa de alguém decidindo, não
               do próprio sync concluindo sozinho por ausência numa resposta. */
        podeEditarUnidades={user.role === 'ADMIN'}
        vacations={vacations.map((v) => ({ id: v.id, collaborator: v.collaborator.name, unit: v.unit.name, start: d(v.startDate), end: d(v.endDate), status: v.status, changeNote: v.changeNote }))}
        schedule={schedule.map((s) => ({ id: s.id, collaborator: s.collaborator.name, unit: s.unit.name, date: d(s.date), planned: s.planned, variation: s.variation, note: s.variationNote }))}
      />
    </div>
  );
}
