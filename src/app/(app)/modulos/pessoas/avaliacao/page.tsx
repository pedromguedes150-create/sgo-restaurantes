import Link from 'next/link';
import { ArrowLeft, Star, BarChart3 } from 'lucide-react';
import { podePlanejar, podeRevisar } from '@/lib/people/pdi';
import { getPainelAvaliacao } from '@/lib/people/avaliacao-painel';
import { lerFiltroPainel, mesesEntre, somarMeses } from '@/lib/people/avaliacao-painel-calculo';
import { hojeNaOperacao } from '@/lib/controle-gerentes-dados';
import { PainelAvaliacaoClient } from '@/components/people/painel-avaliacao-client';
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

export default async function AvaliacaoPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const user = (await getSessionUser())!;
  const months = lastMonths(12);
  const yearMonth = months.includes(searchParams.mes ?? '') ? (searchParams.mes as string) : months[0];
  const aba = searchParams.aba === 'painel' ? 'painel' : 'avaliar';
  const tabs = [
    { label: 'Avaliar', icon: <Star className="h-3.5 w-3.5" />, href: `/modulos/pessoas/avaliacao?mes=${yearMonth}`, active: aba === 'avaliar', testId: 'aba-avaliar' },
    { label: 'Painel', icon: <BarChart3 className="h-3.5 w-3.5" />, href: '/modulos/pessoas/avaliacao?aba=painel', active: aba === 'painel', testId: 'aba-painel' },
  ];

  if (aba === 'painel') {
    const hoje = hojeNaOperacao();
    const filtro = lerFiltroPainel(searchParams, hoje.slice(0, 7));
    const { painel, unidades, funcoes } = await getPainelAvaliacao(user, filtro, hoje);
    const mesesOpcoes = mesesEntre(somarMeses(hoje.slice(0, 7), -23), hoje.slice(0, 7)).reverse();
    return (
      <div className="space-y-4">
        <Link href="/modulos/pessoas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand print:hidden"><ArrowLeft className="h-4 w-4" /> Pessoas</Link>
        <LargeTitle title="Avaliação do colaborador" subtitle="Painel gerencial: cobertura, médias por unidade e função, evolução, quem está abaixo do esperado, critérios com dificuldade e planos de desenvolvimento." tabs={tabs} />
        <PainelAvaliacaoClient painel={painel} filtro={filtro} unidades={unidades} funcoes={funcoes} meses={mesesOpcoes} />
      </div>
    );
  }
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
          tabs={tabs}
        />
      </div>
      <Card>
        <CardContent className="pt-4">
          <EvaluationClient
            rows={rows.map((r) => ({
              collaboratorId: r.collaboratorId, name: r.name, jobTitle: r.jobTitle, unitId: r.unitId, unitName: r.unitName,
              observationCount: r.observationCount, evaluation: r.evaluation, permissao: r.permissao, ferias: r.ferias, anterior: r.anterior, planos: r.planos,
              modelo: r.modelo ? { id: r.modelo.id, name: r.modelo.name, managerial: r.modelo.managerial, version: r.modelo.version, criterios: r.modelo.criterios } : null,
            }))}
            yearMonth={yearMonth}
            months={months}
            isAdmin={user.role === 'ADMIN'}
            weight={weight}
            semCpf={podeAvaliarAlguem && !eu?.cpf}
            podeRevisar={podeRevisar(user.role)}
            podePlanejar={podePlanejar(user.role)}
            meuNome={user.name}
          />
        </CardContent>
      </Card>
    </div>
  );
}
