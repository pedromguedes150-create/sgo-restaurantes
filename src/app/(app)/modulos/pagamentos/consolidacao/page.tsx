import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { permissoesEfetivasDoRequest } from '@/lib/permissions';
import { LargeTitle } from '@/components/layout/page-chrome';
import { Card, CardContent } from '@/components/ui/card';
import { ConsolidacaoPagamentosClient } from '@/components/payments/consolidacao-pagamentos-client';
import { getConsolidacaoPagamentos, getRecorrenciaFreelancers, lerFiltro, unidadesDaConsolidacao } from '@/lib/payments/consolidacao';

export const dynamic = 'force-dynamic';

/**
 * CONSOLIDAÇÃO DE PAGAMENTOS (v1.126.0) — Freelancer + Hora Extra juntos, por
 * qualquer período, para conferir e enviar ao Financeiro.
 *
 * É uma camada de CONSULTA: lê os lançamentos que já existem no módulo
 * Pagamentos. O fluxo Nova → Minhas → Para aprovar → Pagar → Histórico não
 * mudou, e nada aqui altera status.
 */
export default async function ConsolidacaoPagamentosPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const user = (await getSessionUser())!;
  const perms = await permissoesEfetivasDoRequest(user.role);
  if (!perms.PAYMENTS_CONSOLIDATION?.canView) {
    return <p className="text-sm text-ink-500">Acesso restrito. Pagamentos de Freelancers é liberado pela Administração (Configurações → Perfis de acesso).</p>;
  }

  const filtro = lerFiltro({ get: (k) => searchParams[k] ?? null });
  /* Só a visão aberta é calculada: a outra custaria uma consulta à toa. */
  const financeiro = filtro.aba === 'recorrencia' ? undefined : await getConsolidacaoPagamentos(user, filtro);
  const recorrencia = filtro.aba === 'recorrencia' ? await getRecorrenciaFreelancers(user, filtro) : undefined;
  const periodo = (financeiro ?? recorrencia)!.periodo;
  const unidades = financeiro?.unidades ?? (await unidadesDaConsolidacao(user));

  return (
    <div className="space-y-4">
      <Link href="/modulos/pagamentos" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Pagamentos</Link>
      <LargeTitle title="Pagamentos de Freelancers" subtitle="Conferência e preparação do pagamento via PIX. A Visão financeira junta Freelancer e Hora Extra só para consulta." />
      <Card><CardContent className="pt-4">
        <ConsolidacaoPagamentosClient filtro={filtro} unidades={unidades} periodo={periodo} financeiro={financeiro} recorrencia={recorrencia} />
      </CardContent></Card>
    </div>
  );
}
