import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { Card, CardContent } from '@/components/ui/card';
import { TemplatesAdmin } from '@/components/admin/templates-admin';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ChecklistsAdminPage() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN') return <p className="text-sm text-muted-foreground">Restrito ao Administrador.</p>;
  const [units, templates] = await Promise.all([
    prisma.unit.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.taskTemplate.findMany({ orderBy: { order: 'asc' }, include: { items: { orderBy: { order: 'asc' }, select: { section: true, text: true, requiresPhoto: true } } } }),
  ]);

  return (
    <div className="space-y-4">
      <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-accent"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
      <h1 className="text-xl font-bold text-brand">Checklists</h1>
      <Card><CardContent className="pt-4">
        <TemplatesAdmin
          units={units}
          templates={templates.map((t) => ({ id: t.id, unitId: t.unitId, name: t.name, limitTime: t.limitTime, weight: t.weight, scope: t.scope, requiresEvidence: t.requiresEvidence, entersMeta: t.entersMeta, active: t.active, items: t.items.map((i) => ({ section: i.section, text: i.text, requiresPhoto: i.requiresPhoto })) }))}
        />
      </CardContent></Card>
    </div>
  );
}
