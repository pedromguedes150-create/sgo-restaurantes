import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import { ensureDefaultModels, listChecklistModels } from '@/lib/checklist-models';
import { Card, CardContent } from '@/components/ui/card';
import { ChecklistModelsAdmin } from '@/components/admin/checklist-models-admin';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ModelosPage() {
  const user = (await getSessionUser())!;
  if (user.role !== 'ADMIN') return <p className="text-sm text-muted-foreground">Restrito ao Administrador.</p>;
  await ensureDefaultModels().catch(() => {});
  const models = await listChecklistModels();

  return (
    <div className="space-y-4">
      <Link href="/configuracoes/checklists" className="inline-flex items-center gap-1 text-sm font-semibold text-accent"><ArrowLeft className="h-4 w-4" /> Checklists</Link>
      <h1 className="text-xl font-bold text-brand">Biblioteca de modelos de checklist</h1>
      <p className="text-sm text-muted-foreground">Crie, edite e exclua modelos. A partir deles, na aba Checklists você gera os checklists nas unidades.</p>
      <Card><CardContent className="pt-4">
        <ChecklistModelsAdmin
          models={models.map((m) => ({
            id: m.id, name: m.name, category: m.category, moment: m.moment, scope: m.scope, limitTime: m.limitTime,
            weight: m.weight, requiresEvidence: m.requiresEvidence, active: m.active, builtin: m.builtin,
            items: m.items.map((i) => ({ section: i.section, text: i.text, requiresPhoto: i.requiresPhoto })),
          }))}
        />
      </CardContent></Card>
    </div>
  );
}
