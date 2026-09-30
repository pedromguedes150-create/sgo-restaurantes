import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { getQuadroDaCompetencia } from '@/lib/people/payouts-competencia';
import { podeFecharPagamentoExtra } from '@/lib/people/pagamento-extra';
import { listPayoutCollaborators } from '@/lib/people/payouts';
import { Card, CardContent } from '@/components/ui/card';
import { PayoutsCompetenciaClient, type QuadroUI } from '@/components/people/payouts-competencia-client';
import { LargeTitle } from '@/components/layout/page-chrome';

export const dynamic = 'force-dynamic';

/**
 * Os últimos meses E o próximo: a competência do Pagamento Extra é o mês
 * SEGUINTE ao trabalho, então as horas extras de hoje já têm competência — e
 * ela precisa aparecer no seletor.
 */
function competencias(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  for (let i = 0; i < n + 1; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export default async function ComissoesPage({ searchParams }: { searchParams: { mes?: string; aba?: string } }) {
  const user = (await getSessionUser())!;
  const meses = competencias(12);
  /* Abre no mês corrente: a competência do mês que está sendo pago. */
  const competencia = meses.includes(searchParams.mes ?? '') ? (searchParams.mes as string) : meses[1];
  const podeLancar = ['ADMIN', 'SUPERVISOR', 'CEO'].includes(user.role);

  /* As DUAS modalidades são carregadas juntas para a troca de aba não custar
     uma ida ao servidor — e porque os dois contadores aparecem na própria aba. */
  const [extra, mobilidade, colaboradores] = await Promise.all([
    getQuadroDaCompetencia(user, competencia, 'EXTRA'),
    getQuadroDaCompetencia(user, competencia, 'MOBILITY'),
    podeLancar ? listPayoutCollaborators(user) : Promise.resolve([]),
  ]);

  const paraTela = (q: Awaited<ReturnType<typeof getQuadroDaCompetencia>>): QuadroUI => ({
    competencia: q.competencia,
    totalGeral: q.totalGeral,
    totalLancamentos: q.totalLancamentos,
    fechada: q.fechada,
    fechadaPor: q.fechadaPor,
    unidadesSemLancamento: q.unidadesSemLancamento,
    grupos: q.grupos.map((g) => ({
      unitId: g.unitId, unidade: g.unidade, total: g.total, entregaEm: g.entregaEm,
      lancamentos: g.lancamentos.map((l) => ({
        id: l.id, collaboratorId: l.collaboratorId, colaborador: l.colaborador,
        cpf: l.cpf, valor: l.valor, observacao: l.observacao, lancadoPor: l.lancadoPor,
        horas: l.horas, status: l.status,
        horasExtras: l.horasExtras?.map((h) => ({
          id: h.id, dia: h.dia, inicio: h.inicio, fim: h.fim, horas: h.horas, valorHora: h.valorHora,
          vt: h.vt, valor: h.valor, status: h.status, aprovadoPor: h.aprovadoPor,
        })),
      })),
    })),
    extra: q.extra ? {
      mesTrabalhado: q.extra.mesTrabalhado,
      rotuloMesTrabalhado: q.extra.rotuloMesTrabalhado,
      colaboradores: q.extra.colaboradores,
      pendentes: q.extra.pendentes,
      aposFechamento: {
        qtd: q.extra.aposFechamento.qtd,
        valor: q.extra.aposFechamento.valor,
        linhas: q.extra.aposFechamento.linhas.map((h) => ({
          id: h.id, dia: h.dia, inicio: h.inicio, fim: h.fim, horas: h.horas, valorHora: h.valorHora,
          vt: h.vt, valor: h.valor, status: h.status, aprovadoPor: h.aprovadoPor, colaborador: h.colaborador,
        })),
      },
    } : undefined,
  });

  return (
    <div className="space-y-4">
      <Link href="/modulos/pessoas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Pessoas</Link>
      <div>
        <LargeTitle
          title="Pagamento Extra / Mobilidade"
          subtitle="Duas modalidades, duas abas, dois arquivos. O Pagamento Extra vem das horas extras aprovadas em Pagamentos (competência = mês seguinte ao trabalho); a Mobilidade é lançada aqui. A exportação sai separada para a administradora."
        />
      </div>
      <Card>
        <CardContent className="pt-4">
          <PayoutsCompetenciaClient
            competencia={competencia}
            meses={meses}
            extra={paraTela(extra)}
            mobilidade={paraTela(mobilidade)}
            colaboradores={colaboradores.map((c) => ({
              id: c.id,
              nome: c.name,
              cpf: c.cpf,
              /* A unidade exibida é a PRIMEIRA do cadastro, a mesma que o
                 lançamento usará — mostrar uma e gravar outra seria pior que
                 não mostrar nenhuma. */
              unitId: c.units[0]?.unit.id ?? '',
              unidade: c.units[0]?.unit.name ?? '—',
            }))}
            podeLancar={podeLancar}
            abaInicial={searchParams.aba === 'mobilidade' ? 'MOBILITY' : 'EXTRA'}
            podeFecharExtra={podeFecharPagamentoExtra(user.role)}
            isAdmin={user.role === 'ADMIN'}
          />
        </CardContent>
      </Card>
    </div>
  );
}
