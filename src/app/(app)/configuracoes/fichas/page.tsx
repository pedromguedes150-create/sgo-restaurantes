import Link from 'next/link';
import { ArrowLeft, History } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { canEditModule } from '@/lib/permissions';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { listChecklistForms } from '@/lib/checklist-forms/config';
import { Card, CardContent } from '@/components/ui/card';
import { ChecklistFormsAdmin } from '@/components/admin/checklist-forms-admin';

export const dynamic = 'force-dynamic';

export default async function FichasConfigPage() {
  const user = (await getSessionUser())!;
  if (!(await canEditModule(user.role, 'CHECKLIST_FORMS'))) {
    return <p className="text-sm text-ink-500">Acesso restrito. A configuração de fichas é liberada na Gestão de Acessos (Configurações → Perfis de acesso).</p>;
  }

  const [units, forms] = await Promise.all([
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    listChecklistForms(user),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link href="/configuracoes" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Configurações</Link>
        <Link href="/tarefas/fichas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><History className="h-4 w-4" /> Histórico de envios</Link>
      </div>
      <div>
        <h1 className="text-xl font-bold text-brand">Fichas (checklists por link)</h1>
        <p className="text-sm text-ink-500">Monte fichas por unidade e gere um link para a equipe preencher (sem login). Os envios ficam no histórico.</p>
      </div>
      {units.length === 0 ? (
        <Card><CardContent className="py-6 text-sm text-ink-500">Nenhuma unidade no seu escopo.</CardContent></Card>
      ) : (
        <Card><CardContent className="pt-4">
          <ChecklistFormsAdmin units={units} forms={forms ?? []} />
        </CardContent></Card>
      )}
    </div>
  );
}
