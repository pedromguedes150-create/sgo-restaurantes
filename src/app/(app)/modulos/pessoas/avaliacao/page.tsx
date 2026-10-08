import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { listEvaluationBoard, getEvaluationWeight } from '@/lib/people/evaluation';
import { ensureModelosIniciais, avisarFuncoesSemModelo } from '@/lib/people/avaliacao-modelos';
import { Card, CardContent } from '@/components/ui/card';
import { EvaluationClient } from '@/components/people/evaluation-client';
import { LargeTitle } from '@/components/layout/page-chrome';

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
  /* Modelos iniciais semeados na 1ª abertura (idempotente); funções sem modelo avisam os Admins 1×/dia. */
  await ensureModelosIniciais();
  const [rows, weight, eu] = await Promise.all([listEvaluationBoard(user, yearMonth), getEvaluationWeight(), prisma.user.findUnique({ where: { id: user.id }, select: { cpf: true } })]);
  await avisarFuncoesSemModelo().catch(() => 0);
  const avaliadas = rows.filter((r) => r.evaluation).length;
  const pendentes = rows.filter((r) => !r.evaluation && r.modelo).length;
  const semModelo = rows.filter((r) => !r.modelo).length;
  const podeAvaliarAlguem = rows.some((r) => r.permissao.pode) || user.role === 'MANAGER' || user.role === 'COORDINATOR' || user.role === 'SUPERVISOR' || user.role === 'ADMIN';

  return (
    <div className="space-y-4">
      <Link href="/modulos/pessoas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Pessoas</Link>
      <div>
        <LargeTitle
          title="Avaliação do colaborador"
          subtitle={<>Avaliação mensal pelo modelo da função (8 critérios com peso) + observações do dia a dia. O cadastro continua vindo do RH.{' '}
            {avaliadas}/{rows.length} avaliado(s){pendentes > 0 ? ` · ${pendentes} a avaliar` : ''}{semModelo > 0 ? ` · ${semModelo} sem modelo` : ''}.</>}
        />
      </div>
      <Card>
        <CardContent className="pt-4">
          <EvaluationClient
            rows={rows.map((r) => ({
              collaboratorId: r.collaboratorId, name: r.name, jobTitle: r.jobTitle, unitId: r.unitId, unitName: r.unitName,
              observationCount: r.observationCount, evaluation: r.evaluation, permissao: r.permissao, ferias: r.ferias,
              modelo: r.modelo ? { id: r.modelo.id, name: r.modelo.name, managerial: r.modelo.managerial, version: r.modelo.version, criterios: r.modelo.criterios } : null,
            }))}
            yearMonth={yearMonth}
            months={months}
            isAdmin={user.role === 'ADMIN'}
            weight={weight}
            semCpf={podeAvaliarAlguem && !eu?.cpf}
          />
        </CardContent>
      </Card>
    </div>
  );
}
