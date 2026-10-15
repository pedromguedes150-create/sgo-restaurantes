'use client';

import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { shortUnitName } from '@/lib/unit-name';
import { emBR } from '@/lib/payments/consolidacao-calculo';
import { queryDoFiltroReembolso, statusTexto, type FiltroReembolso, type LinhaReembolso, type ReembolsoPorColaborador } from '@/lib/payments/reembolsos-calculo';
import type { PaymentStatus } from '@prisma/client';

type Opcao<T extends string> = { value: T; label: string };
const TONE: Record<PaymentStatus, 'medium' | 'success' | 'critical' | 'neutral'> = { PENDING: 'medium', APPROVED: 'neutral', PAID: 'success', REJECTED: 'critical' };
const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Reembolsos — filtros na URL (a página e o Excel leem o mesmo), lista com o
 * descritivo e o total por colaborador. Só consulta: nada aqui aprova ou paga.
 */
export function ReembolsosClient({ filtro, periodos, status, unidades, linhas, porColaborador, kpis }: {
  filtro: FiltroReembolso;
  periodos: Opcao<FiltroReembolso['periodo']>[];
  status: Opcao<FiltroReembolso['status']>[];
  unidades: { id: string; name: string }[];
  linhas: LinhaReembolso[];
  porColaborador: ReembolsoPorColaborador[];
  kpis: React.ReactNode;
}) {
  const router = useRouter();
  const ir = (f: FiltroReembolso) => router.push(`/modulos/pagamentos/reembolsos?${queryDoFiltroReembolso(f)}`);

  return (
    <div className="space-y-4">
      <div className="sgo-filtros -mx-4">
        <Select aria-label="Período" value={filtro.periodo} onValueChange={(v) => ir({ ...filtro, periodo: v as FiltroReembolso['periodo'] })} options={periodos} size="sm" />
        {filtro.periodo === 'personalizado' && (
          <>
            <DatePicker aria-label="De" value={filtro.de || null} onValueChange={(v) => ir({ ...filtro, de: v ?? '' })} />
            <DatePicker aria-label="Até" value={filtro.ate || null} onValueChange={(v) => ir({ ...filtro, ate: v ?? '' })} />
          </>
        )}
        {unidades.length > 1 && (
          <Select aria-label="Unidade" value={filtro.unitId} onValueChange={(v) => ir({ ...filtro, unitId: v })} options={[{ value: '', label: 'Todas as unidades' }, ...unidades.map((u) => ({ value: u.id, label: shortUnitName(u.name) }))]} size="sm" />
        )}
        <Select aria-label="Status" value={filtro.status} onValueChange={(v) => ir({ ...filtro, status: v as FiltroReembolso['status'] })} options={status} size="sm" />
      </div>

      {kpis}

      <Card>
        <CardHeader><CardTitle className="text-base">Reembolsos ({linhas.length})</CardTitle></CardHeader>
        <CardContent>
          {linhas.length === 0 && <p className="text-sm text-ink-500">Nenhum reembolso neste recorte.</p>}
          {linhas.length > 0 && (
            <div className="overflow-x-auto">
              <table className="sgo-tbl w-full text-sm" data-testid="tabela-reembolsos">
                <thead>
                  <tr>
                    <th>Despesa</th><th>Solicitado</th><th>Colaborador</th><th>Motivo</th><th>Descrição</th><th className="text-right">Valor</th><th>Status</th><th>Comprov.</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap">{l.dataDespesa ? emBR(l.dataDespesa) : '—'}</td>
                      <td className="whitespace-nowrap">{emBR(l.dataSolicitacao)}</td>
                      <td><span className="font-semibold text-ink-900">{l.colaborador}</span>{unidades.length > 1 ? <span className="block text-xs text-ink-500">{shortUnitName(l.unidade)}</span> : null}</td>
                      <td>{l.motivo}</td>
                      <td className="max-w-md">{l.descricao || '—'}{l.rejeicao ? <span className="block text-xs text-danger">Rejeitado: {l.rejeicao}</span> : null}</td>
                      <td className="whitespace-nowrap text-right font-semibold tabular-nums">{fmt(l.valor)}</td>
                      <td><StatusBadge tone={TONE[l.status]}>{statusTexto(l.status)}</StatusBadge></td>
                      <td>{l.comprovante ? 'Sim' : <span className="text-warning">Não</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {porColaborador.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Por colaborador (sem rejeitados)</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="sgo-tbl w-full text-sm" data-testid="tabela-por-colaborador">
                <thead><tr><th>Colaborador</th><th>Unidade(s)</th><th className="text-right">Reembolsos</th><th className="text-right">Total</th><th className="text-right">Pago</th><th className="text-right">Pendente / a pagar</th></tr></thead>
                <tbody>
                  {porColaborador.map((c) => (
                    <tr key={c.chave}>
                      <td className="font-semibold text-ink-900">{c.colaborador}</td>
                      <td className="text-xs text-ink-500">{c.unidades.map(shortUnitName).join(', ')}</td>
                      <td className="text-right tabular-nums">{c.quantidade}</td>
                      <td className="text-right font-semibold tabular-nums">{fmt(c.total)}</td>
                      <td className="text-right tabular-nums">{fmt(c.pago)}</td>
                      <td className="text-right tabular-nums">{fmt(c.pendente)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
