import Link from 'next/link';
import { ArrowLeft, Download } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { getReembolsos, lerFiltroReembolso, queryDoFiltroReembolso, STATUS_REEMBOLSO } from '@/lib/payments/reembolsos';
import { PERIODOS_RAPIDOS } from '@/lib/payments/consolidacao-calculo';
import { ReembolsosClient } from '@/components/payments/reembolsos-client';
import { LargeTitle } from '@/components/layout/page-chrome';
import { SgoKpis, SgoKpi } from '@/components/sgo/sgo-kpi';

export const dynamic = 'force-dynamic';

/**
 * Reembolsos (v1.169.0): o que o funcionário pagou do próprio bolso (passagem,
 * despesa) ou a diferença de um pagamento calculado errado. Camada de
 * CONSULTA sobre `payment_requests` (tipo MISC): filtros na URL, totais,
 * lista, por colaborador e a planilha Excel com o descritivo — nada grava.
 * A lógica de solicitar/aprovar/pagar segue em Pagamentos.
 */
export default async function ReembolsosPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const user = (await getSessionUser())!;
  const filtro = lerFiltroReembolso({ get: (k) => searchParams[k] ?? null });
  const d = await getReembolsos(user, filtro);
  const query = queryDoFiltroReembolso(filtro);
  const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-4">
      <Link href="/modulos/pagamentos" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Pagamentos</Link>
      <LargeTitle
        title="Reembolsos"
        subtitle={<>Passagens e despesas pagas pelo funcionário do próprio bolso, e diferenças de pagamento. Solicitações de <b>{d.periodo.rotulo}</b>. Para pedir um reembolso, use Pagamentos → Nova → Reembolso.</>}
        actions={<a href={`/api/payments/reembolsos/export?${query}`} className="sgo-btn" data-testid="excel-reembolsos"><Download className="h-3.5 w-3.5" /> Baixar Excel</a>}
      />

      <ReembolsosClient
        filtro={filtro}
        periodos={PERIODOS_RAPIDOS}
        status={STATUS_REEMBOLSO}
        unidades={d.unidades}
        linhas={d.linhas}
        porColaborador={d.porColaborador}
        kpis={
          <SgoKpis>
            <SgoKpi label="Reembolsos" value={String(d.resumo.quantidade)} meta={d.resumo.semComprovante ? `${d.resumo.semComprovante} sem comprovante` : 'todos com comprovante'} />
            <SgoKpi label="Total" value={fmt(d.resumo.total)} meta="sem os rejeitados" />
            <SgoKpi label="Pendente" value={fmt(d.resumo.pendente)} meta="aguardando aprovação" />
            <SgoKpi label="A pagar" value={fmt(d.resumo.aPagar)} meta="aprovado, ainda não pago" />
            <SgoKpi label="Pago" value={fmt(d.resumo.pago)} />
          </SgoKpis>
        }
      />
    </div>
  );
}
