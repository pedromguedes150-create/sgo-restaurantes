import Link from 'next/link';
import { ArrowLeft, UserCheck } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { listProbation } from '@/lib/people/probation';
import { Card, CardContent } from '@/components/ui/card';
import { ProbationClient } from '@/components/people/probation-client';

export const dynamic = 'force-dynamic';

export default async function ExperienciaPage() {
  const user = (await getSessionUser())!;
  const rows = await listProbation(user);
  const canReview = user.role !== 'FINANCE' && user.role !== 'CEO';
  const pendentes = rows.filter((r) => r.status === 'PENDING').length;

  return (
    <div className="space-y-4">
      <Link href="/modulos/pessoas" className="inline-flex items-center gap-1 text-sm font-semibold text-sgo-brand"><ArrowLeft className="h-4 w-4" /> Pessoas</Link>
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-sgo-brand"><UserCheck className="h-5 w-5 text-sgo-brand" /> Período de Experiência</h1>
        <p className="text-sm text-ink-500">Colaboradores com até 90 dias de casa (admissão vinda do RH). {pendentes > 0 ? `${pendentes} a avaliar.` : 'Nada pendente.'}</p>
      </div>
      <Card><CardContent className="pt-4"><ProbationClient rows={rows} canReview={canReview} /></CardContent></Card>
    </div>
  );
}
