import Link from 'next/link';
import { ArrowLeft, Star } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { listEvaluationBoard, getEvaluationWeight } from '@/lib/people/evaluation';
import { Card, CardContent } from '@/components/ui/card';
import { EvaluationClient } from '@/components/people/evaluation-client';

export const dynamic = 'force-dynamic';

function lastMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export default async function AvaliacaoPage({ searchParams }: { searchParams: { mes?: string } }) {
  const user = (await getSessionUser())!;
  const months = lastMonths(12);
  const yearMonth = months.includes(searchParams.mes ?? '') ? (searchParams.mes as string) : months[0];
  const [rows, weight] = await Promise.all([listEvaluationBoard(user, yearMonth), getEvaluationWeight()]);
  const canEvaluate = user.role !== 'FINANCE' && user.role !== 'CEO';
  const pendentes = rows.filter((r) => !r.evaluation).length;

  return (
    <div className="space-y-4">
      <Link href="/modulos/pessoas" className="inline-flex items-center gap-1 text-sm font-semibold text-accent"><ArrowLeft className="h-4 w-4" /> Pessoas</Link>
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-brand"><Star className="h-5 w-5 text-accent" /> Avaliação do colaborador</h1>
        <p className="text-sm text-muted-foreground">
          Observações do dia a dia + avaliação mensal (o cadastro continua vindo do RH).{' '}
          {pendentes > 0 ? `${pendentes} a avaliar no mês.` : 'Todos avaliados no mês.'}
        </p>
      </div>
      <Card>
        <CardContent className="pt-4">
          <EvaluationClient
            rows={rows.map((r) => ({
              collaboratorId: r.collaboratorId, name: r.name, jobTitle: r.jobTitle, unitName: r.unitName,
              observationCount: r.observationCount, evaluation: r.evaluation,
            }))}
            yearMonth={yearMonth}
            months={months}
            canEvaluate={canEvaluate}
            isAdmin={user.role === 'ADMIN'}
            weight={weight}
          />
        </CardContent>
      </Card>
    </div>
  );
}
