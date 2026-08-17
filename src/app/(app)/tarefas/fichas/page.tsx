import Link from 'next/link';
import { ArrowLeft, Settings } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { canEditModule } from '@/lib/permissions';
import { listChecklistForms } from '@/lib/checklist-forms/config';
import { listChecklistSubmissions } from '@/lib/checklist-forms/history';
import { Card, CardContent } from '@/components/ui/card';
import { ChecklistSubmissions } from '@/components/checklist-forms/checklist-submissions';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

export default async function FichasHistoryPage({ searchParams }: { searchParams: { ficha?: string; dias?: string } }) {
  const user = (await getSessionUser())!;
  if (!(await canEditModule(user.role, 'CHECKLIST_FORMS'))) {
    return <p className="text-sm text-ink-500">Acesso restrito. Liberado na Gestão de Acessos (Configurações → Perfis de acesso).</p>;
  }
  const days = Number(searchParams.dias) || 30;
  const ficha = searchParams.ficha || '';
  const [forms, submissions] = await Promise.all([
    listChecklistForms(user),
    listChecklistSubmissions(user, { templateId: ficha || undefined, days }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link href="/tarefas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Tarefas</Link>
        <Link href="/configuracoes/fichas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><Settings className="h-4 w-4" /> Configurar fichas</Link>
      </div>
      <div>
        <LargeTitle title="Fichas — histórico de envios" subtitle="Preenchimentos recebidos pelas fichas por link (quem, quando e as respostas)." />
      </div>
      <Card><CardContent className="pt-4">
        <ChecklistSubmissions forms={(forms ?? []).map((f) => ({ id: f.id, title: f.title }))} submissions={submissions ?? []} ficha={ficha} days={days} />
      </CardContent></Card>
    </div>
  );
}
