import Link from 'next/link';
import { ArrowLeft, Calculator, CalendarCheck, Download, Settings2 } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { unitScopeWhere } from '@/lib/scope/unit-scope';
import { getQuadroDaCompetencia } from '@/lib/people/payouts-competencia';
import { listPayoutCollaborators } from '@/lib/people/payouts';
import { competencias, paraTelaDoQuadro } from '@/lib/people/quadro-ui';
import { getPercentuais, chavesDaCozinha } from '@/lib/comissao/config';
import { listarApuracoes } from '@/lib/comissao/apuracao';
import { competenciaDePagamento, mesDeVendaPadrao, rotuloDoMes, somarMeses } from '@/lib/comissao/calculo';
import { diaEmBrasilia } from '@/lib/metas/pontuacao';
import { permissaoDeRota } from '@/lib/permissions/links';
import { Card, CardContent } from '@/components/ui/card';
import { PayoutsCompetenciaClient } from '@/components/people/payouts-competencia-client';
import { ApuracaoClient } from '@/components/comissao/apuracao-client';
import { LargeTitle } from '@/components/layout/page-chrome';
import { formatBRL } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * COMISSÃO (v1.175.0) — duas abas: APURAÇÃO (a planilha do Teknisa vira a
 * conta, conferida e gravada) e COMPETÊNCIA (os lançamentos de Comissão por
 * mês de pagamento, com entrega, fechamento e o arquivo da administradora —
 * o mesmo quadro da Mobilidade, tipo COMMISSION).
 */
export default async function ComissaoPage({ searchParams }: { searchParams: { aba?: string; mes?: string } }) {
  const user = (await getSessionUser())!;
  const aba = searchParams.aba === 'competencia' ? 'competencia' : 'apuracao';
  const hoje = diaEmBrasilia(new Date());
  const mesPadrao = mesDeVendaPadrao(hoje);
  const podeApurar = ['ADMIN', 'SUPERVISOR', 'CEO'].includes(user.role);
  const podeConfigurar = (await permissaoDeRota(user.role))('/configuracoes/comissao');

  const tabs = [
    { label: 'Apuração', icon: <Calculator className="h-3.5 w-3.5" />, href: '/modulos/comissao', active: aba === 'apuracao', testId: 'aba-apuracao' },
    { label: 'Competência', icon: <CalendarCheck className="h-3.5 w-3.5" />, href: `/modulos/comissao?aba=competencia&mes=${competenciaDePagamento(mesPadrao)}`, active: aba === 'competencia', testId: 'aba-competencia' },
  ];

  if (aba === 'competencia') {
    const meses = competencias(12);
    const competencia = meses.includes(searchParams.mes ?? '') ? (searchParams.mes as string) : competenciaDePagamento(mesPadrao);
    const [quadro, colaboradores] = await Promise.all([
      getQuadroDaCompetencia(user, competencia, 'COMMISSION'),
      podeApurar ? listPayoutCollaborators(user) : Promise.resolve([]),
    ]);
    return (
      <div className="space-y-4">
        <Link href="/modulos/pessoas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Pessoas</Link>
        <LargeTitle
          title="Comissão"
          subtitle={`Competência de pagamento ${rotuloDoMes(competencia)} = vendas de ${rotuloDoMes(somarMeses(competencia, -2))}. Entrega por unidade, fechamento e o Pedido de Carga Swile.`}
          tabs={tabs}
          actions={<a href={`/api/comissao/swile?mes=${competencia}`} className="sgo-btn sgo-btn--sm" data-testid="exportar-swile"><Download className="h-4 w-4" /> Pedido de Carga Swile (XLSX)</a>}
        />
        <p className="text-xs text-ink-500">O arquivo da Swile sai no modelo &ldquo;Pedido de Carga Swile — Customizado&rdquo;: Nome · CPF · Saldo Livre (a comissão) · Mobilidade · Refeição e Alimentação, uma linha por pessoa, CPF do cadastro do RH. Quem está sem CPF no RH vai numa aba &ldquo;Sem CPF&rdquo; para completar antes de carregar.</p>
        <Card><CardContent className="pt-4">
          <PayoutsCompetenciaClient
            tipo="COMMISSION" quadro={paraTelaDoQuadro(quadro)} competencia={competencia} meses={[...new Set([competencia, ...meses])]}
            colaboradores={colaboradores.map((c) => ({ id: c.id, nome: c.name, cpf: c.cpf, unitId: c.units[0]?.unit.id ?? '', unidade: c.units[0]?.unit.name ?? '—' }))}
            podeLancar={podeApurar} podeFecharExtra={false} isAdmin={user.role === 'ADMIN'} basePath="/modulos/comissao?aba=competencia"
          />
        </CardContent></Card>
      </div>
    );
  }

  const [unidades, percentuais, cozinha, apuracoes] = await Promise.all([
    prisma.unit.findMany({ where: { active: true, ...unitScopeWhere(user, 'id') }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    getPercentuais(), chavesDaCozinha(), listarApuracoes(user),
  ]);
  const meses = Array.from({ length: 12 }, (_, i) => somarMeses(mesPadrao, -i));

  return (
    <div className="space-y-4">
      <Link href="/modulos/pessoas" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Pessoas</Link>
      <LargeTitle
        title="Comissão"
        subtitle="Importe a planilha do Teknisa, confira vendedor por vendedor, ajuste o que foi combinado e grave. A venda de um mês é apurada no seguinte e paga no segundo."
        tabs={tabs}
        actions={podeConfigurar ? <Link href="/configuracoes/comissao" className="sgo-btn sgo-btn--sm"><Settings2 className="h-4 w-4" /> Percentuais e funções</Link> : undefined}
      />
      {podeApurar ? (
        <ApuracaoClient unidades={unidades} meses={meses} mesInicial={mesPadrao} percentuais={percentuais} funcoesDaCozinha={cozinha.size} />
      ) : (
        <p className="text-sm text-ink-500">A apuração é feita pela Supervisão e pela Administração. Veja os lançamentos na aba Competência.</p>
      )}

      <section className="sgo-panel sgo-panel--solid overflow-hidden" data-testid="apuracoes-feitas">
        <p className="sgo-panel__title px-3 pt-3">Apurações já gravadas</p>
        {apuracoes.length === 0 ? <p className="px-3 pb-3 text-sm text-ink-500">Nenhuma apuração ainda.</p> : (
          <div className="overflow-x-auto">
            <table className="sgo-tbl w-full text-sm">
              <thead><tr><th className="text-left">Unidade</th><th className="text-left">Vendas de</th><th className="text-left">Paga em</th><th className="text-right">Venda total</th><th className="text-right">Comissão</th><th className="text-right">Lançamentos</th><th className="text-right">Não cadastrados</th><th className="text-left">Gravada por</th></tr></thead>
              <tbody>
                {apuracoes.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap font-medium text-ink-900">{a.unidade}</td>
                    <td className="whitespace-nowrap">{rotuloDoMes(a.mesVenda)}</td>
                    <td className="whitespace-nowrap"><Link href={`/modulos/comissao?aba=competencia&mes=${a.competencia}`} className="text-brand">{rotuloDoMes(a.competencia)}</Link></td>
                    <td className="text-right tabular-nums">{formatBRL(a.totalVendas)}</td>
                    <td className="text-right tabular-nums font-semibold">{formatBRL(a.comissao)}</td>
                    <td className="text-right tabular-nums">{a.linhasPagas}</td>
                    <td className={`text-right tabular-nums ${a.naoCadastrados > 0 ? 'text-warning' : ''}`}>{a.naoCadastrados}</td>
                    <td className="whitespace-nowrap text-xs text-ink-500">{a.importedByName} · {a.importedAt.toLocaleDateString('pt-BR')}{a.replacedCount > 0 ? ` · substituída ${a.replacedCount}×` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
