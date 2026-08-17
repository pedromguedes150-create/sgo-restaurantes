import Link from 'next/link';
import { SegmentedNav } from '@/components/ui/ds/segmented-nav';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { TemplatesAdmin } from '@/components/admin/templates-admin';
import { ChecklistToleranceConfig } from '@/components/admin/checklist-tolerance-config';
import { ChecklistModelsAdmin } from '@/components/admin/checklist-models-admin';
import { SupervisorChecklistsAdmin } from '@/components/admin/supervisor-checklists-admin';
import { ChecklistCoverageMatrix } from '@/components/admin/checklist-coverage-matrix';
import { ensureDefaultModels, listChecklistModels } from '@/lib/checklist-models';
import { listSupervisorChecklists } from '@/lib/supervisor/visits';
import { getChecklistToleranceMin } from '@/lib/tasks/tolerance';
import { ArrowLeft } from 'lucide-react';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

/**
 * Hub único de checklists (pedido 07/07): Checklists das unidades + Biblioteca
 * de modelos + Checklists de supervisor em UMA página com abas (?tab=).
 */
export default async function ChecklistsAdminPage({ searchParams }: { searchParams: { tab?: string } }) {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN' && user.role !== 'CEO') return <p className="text-sm text-ink-500">Restrito ao Administrador.</p>;
  await ensureDefaultModels().catch(() => {}); // popula a biblioteca padrão na 1ª vez
  const tab = ['unidades', 'modelos', 'supervisor', 'resumo'].includes(searchParams.tab ?? '') ? (searchParams.tab as string) : 'unidades';

  const [units, templates, models, tolerance, supChecklists] = await Promise.all([
    prisma.unit.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, code: true } }),
    prisma.taskTemplate.findMany({ orderBy: { order: 'asc' }, include: { items: { orderBy: { order: 'asc' }, select: { section: true, text: true, requiresPhoto: true, aiCheck: true, standardDescription: true } } } }),
    listChecklistModels({}),
    getChecklistToleranceMin(),
    listSupervisorChecklists(),
  ]);

  // Unidades de cada "grupo" (checklist replicado em várias unidades compartilha groupKey)
  const groupUnits = new Map<string, string[]>();
  for (const t of templates) {
    if (!t.groupKey) continue;
    groupUnits.set(t.groupKey, [...(groupUnits.get(t.groupKey) ?? []), t.unitId]);
  }

  const TABS = [
    { key: 'unidades', label: 'Checklists das unidades' },
    { key: 'resumo', label: 'Resumo por unidade' },
    { key: 'modelos', label: 'Biblioteca de modelos' },
    { key: 'supervisor', label: 'Checklists de supervisor' },
  ];

  // Matriz checklist × unidade (só ativos) — resumo p/ o supervisor achar faltas
  const covMap = new Map<string, { name: string; module: string; unitIds: Set<string> }>();
  for (const t of templates) {
    if (!t.active) continue;
    const key = t.name.trim().toLowerCase();
    const r = covMap.get(key) ?? { name: t.name, module: t.module, unitIds: new Set<string>() };
    r.unitIds.add(t.unitId);
    covMap.set(key, r);
  }
  const covRows = [...covMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map((r) => ({ name: r.name, module: r.module, unitIds: [...r.unitIds] }));

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <LargeTitle title="Checklists" />
      <SegmentedNav
        aria-label="Seções de Checklists"
        value={tab}
        options={TABS.map((t) => ({ value: t.key, label: t.label, href: `/configuracoes/checklists?tab=${t.key}` }))}
      />

      {tab === 'unidades' && (
        <>
          <Card><CardContent className="pt-4"><ChecklistToleranceConfig current={tolerance} /></CardContent></Card>
          <Card><CardContent className="pt-4">
            <TemplatesAdmin
              units={units}
              examples={models.filter((m) => m.active).map((m) => ({ id: m.id, name: m.name, category: m.category, moment: m.moment, scope: m.scope, limitTime: m.limitTime, requiresEvidence: m.requiresEvidence, weight: m.weight, itemCount: m.items.length }))}
              templates={templates.map((t) => ({ id: t.id, unitId: t.unitId, name: t.name, limitTime: t.limitTime, weight: t.weight, scope: t.scope, requiresEvidence: t.requiresEvidence, entersMeta: t.entersMeta, active: t.active, startDate: t.startDate, endDate: t.endDate, groupUnitIds: t.groupKey ? (groupUnits.get(t.groupKey) ?? [t.unitId]) : [t.unitId], items: t.items.map((i) => ({ section: i.section, text: i.text, requiresPhoto: i.requiresPhoto, aiCheck: i.aiCheck, standardDescription: i.standardDescription })) }))}
            />
          </CardContent></Card>
        </>
      )}

      {tab === 'resumo' && (
        <Card><CardContent className="pt-4">
          <ChecklistCoverageMatrix units={units.map((u) => ({ id: u.id, name: u.name, code: u.code }))} rows={covRows} />
        </CardContent></Card>
      )}

      {tab === 'modelos' && (
        <Card><CardContent className="pt-4">
          <ChecklistModelsAdmin models={models.map((m) => ({ id: m.id, name: m.name, category: m.category, moment: m.moment, scope: m.scope, limitTime: m.limitTime, weight: m.weight, requiresEvidence: m.requiresEvidence, active: m.active, builtin: m.builtin, items: m.items.map((i) => ({ section: i.section, text: i.text, requiresPhoto: i.requiresPhoto })) }))} />
        </CardContent></Card>
      )}

      {tab === 'supervisor' && (
        <Card><CardContent className="pt-4">
          <SupervisorChecklistsAdmin checklists={supChecklists.map((c) => ({ id: c.id, name: c.name, items: Array.isArray(c.items) ? (c.items as string[]) : [], active: c.active }))} />
        </CardContent></Card>
      )}
    </div>
  );
}
