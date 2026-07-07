import { prisma } from '@/lib/db/prisma';
import { notifyUnitRole, notifyAdmins } from '@/lib/notifications';

/**
 * Resumo semanal de aderência (sugestão 6 da análise 08/07): 1×/semana o
 * sistema cobra sozinho — para cada unidade com sinais de abandono (dias sem
 * desperdício/comandas, checklists baixos na semana), avisa o supervisor da
 * unidade; os Admins recebem um consolidado. Controlado por AppSetting
 * ADHERENCE_DIGEST_LAST (roda no máx. 1×/semana, robusto a reinícios).
 */
const LAST_KEY = 'ADHERENCE_DIGEST_LAST';
const DAY = 24 * 60 * 60 * 1000;

function isoDaysAgo(n: number): string {
  const d = new Date(Date.now() - n * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface UnitIssue { unitId: string; unitName: string; issues: string[] }

/** Avalia os últimos 7 dias e devolve as unidades com sinais de não-uso. */
export async function computeAdherenceIssues(): Promise<UnitIssue[]> {
  const units = await prisma.unit.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  const since = isoDaysAgo(7);
  const yesterday = isoDaysAgo(1);
  const out: UnitIssue[] = [];

  for (const u of units) {
    const issues: string[] = [];
    const [wasteDays, commandDays, done, missed] = await Promise.all([
      prisma.wasteEntry.count({ where: { unitId: u.id, operationalDate: { gte: since, lte: yesterday } } }),
      prisma.commandCount.count({ where: { unitId: u.id, operationalDate: { gte: since, lte: yesterday } } }),
      prisma.taskInstance.count({ where: { unitId: u.id, operationalDate: { gte: since, lte: yesterday }, status: 'DONE' } }),
      prisma.taskInstance.count({ where: { unitId: u.id, operationalDate: { gte: since, lte: yesterday }, status: 'MISSED' } }),
    ]);
    const resolved = done + missed;
    const checklistPct = resolved === 0 ? null : Math.round((done / resolved) * 100);

    if (wasteDays <= 3) issues.push(`desperdício lançado em só ${wasteDays}/7 dias`);
    if (commandDays <= 3) issues.push(`comandas conferidas em só ${commandDays}/7 dias`);
    if (checklistPct != null && checklistPct < 70) issues.push(`checklists da semana em ${checklistPct}%`);
    if (resolved === 0) issues.push('nenhum checklist resolvido na semana');

    if (issues.length > 0) out.push({ unitId: u.id, unitName: u.name, issues });
  }
  return out;
}

/** Scheduler: roda no máximo 1×/semana. Retorna quantas unidades foram cobradas. */
export async function runWeeklyAdherenceDigest(): Promise<{ ran: boolean; flagged: number }> {
  const last = await prisma.appSetting.findUnique({ where: { key: LAST_KEY } });
  if (last && Date.now() - new Date(last.value).getTime() < 6.5 * DAY) return { ran: false, flagged: 0 };

  const flagged = await computeAdherenceIssues();
  for (const f of flagged) {
    await notifyUnitRole(f.unitId, 'SUPERVISOR', {
      title: 'Aderência da semana — atenção',
      body: `${f.unitName}: ${f.issues.join('; ')}. Veja o Painel de uso na Rotina do Supervisor.`,
      link: '/modulos/supervisao', module: 'SUPERVISION',
    }).catch(() => {});
  }
  if (flagged.length > 0) {
    await notifyAdmins({
      title: `Aderência semanal: ${flagged.length} unidade(s) com alerta`,
      body: flagged.map((f) => `${f.unitName} (${f.issues.length} alerta(s))`).join(' · '),
      link: '/modulos/supervisao', module: 'SUPERVISION',
    }).catch(() => {});
  }
  await prisma.appSetting.upsert({
    where: { key: LAST_KEY },
    create: { key: LAST_KEY, value: new Date().toISOString() },
    update: { value: new Date().toISOString() },
  });
  return { ran: true, flagged: flagged.length };
}
