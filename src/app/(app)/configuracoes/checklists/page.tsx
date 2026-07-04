import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { TemplatesAdmin } from '@/components/admin/templates-admin';
import { ChecklistToleranceConfig } from '@/components/admin/checklist-tolerance-config';
import { ensureDefaultModels, listChecklistModels } from '@/lib/checklist-models';
import { getChecklistToleranceMin } from '@/lib/tasks/tolerance';
import { ArrowLeft, LayoutTemplate } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ChecklistsAdminPage() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN') return <p className="text-sm text-muted-foreground">Restrito ao Administrador.</p>;
  await ensureDefaultModels().catch(() => {}); // popula a biblioteca padrão na 1ª vez
  const [units, templates, models, tolerance] = await Promise.all([
    prisma.unit.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.taskTemplate.findMany({ orderBy: { order: 'asc' }, include: { items: { orderBy: { order: 'asc' }, select: { section: true, text: true, requiresPhoto: true, aiCheck: true, standardDescription: true } } } }),
    listChecklistModels({ activeOnly: true }),
    getChecklistToleranceMin(),
  ]);

  // Unidades de cada "grupo" (checklist replicado em várias unidades compartilha groupKey)
  const groupUnits = new Map<string, string[]>();
  for (const t of templates) {
    if (!t.groupKey) continue;
    groupUnits.set(t.groupKey, [...(groupUnits.get(t.groupKey) ?? []), t.unitId]);
  }

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-accent"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-brand">Checklists</h1>
        <Link href="/configuracoes/modelos" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-accent"><LayoutTemplate className="h-4 w-4" /> Biblioteca de modelos</Link>
      </div>
      <Card><CardContent className="pt-4"><ChecklistToleranceConfig current={tolerance} /></CardContent></Card>

      <Card><CardContent className="pt-4">
        <TemplatesAdmin
          units={units}
          examples={models.map((m) => ({ id: m.id, name: m.name, category: m.category, moment: m.moment, scope: m.scope, limitTime: m.limitTime, requiresEvidence: m.requiresEvidence, weight: m.weight, itemCount: m.items.length }))}
          templates={templates.map((t) => ({ id: t.id, unitId: t.unitId, name: t.name, limitTime: t.limitTime, weight: t.weight, scope: t.scope, requiresEvidence: t.requiresEvidence, entersMeta: t.entersMeta, active: t.active, startDate: t.startDate, endDate: t.endDate, groupUnitIds: t.groupKey ? (groupUnits.get(t.groupKey) ?? [t.unitId]) : [t.unitId], items: t.items.map((i) => ({ section: i.section, text: i.text, requiresPhoto: i.requiresPhoto, aiCheck: i.aiCheck, standardDescription: i.standardDescription })) }))}
        />
      </CardContent></Card>
    </div>
  );
}
