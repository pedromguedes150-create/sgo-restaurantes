import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Printer } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { getInventario, responsaveisDaUnidade } from '@/lib/utensilios/inventario';
import { EDITAVEL, PODE_AUDITAR, PODE_CONTAR, ROTULO_STATUS, TOM_STATUS, contarDivergencias, diferenca } from '@/lib/utensilios/regras';
import { LargeTitle } from '@/components/layout/page-chrome';
import { StatusBadge } from '@/components/ui/ds/status-badge';
import { AutoPrint } from '@/components/shared/auto-print';
import { ContagemClient } from '@/components/utensilios/contagem-client';
import { AuditoriaClient } from '@/components/utensilios/auditoria-client';

export const dynamic = 'force-dynamic';

const ROTULO_EVENTO: Record<string, string> = {
  CRIADO: 'Contagem aberta', ENVIADO: 'Enviado para auditoria', REENVIADO: 'Reenviado após correção',
  DEVOLVIDO: 'Devolvido para correção', AUDITADO: 'Conferência registrada', APROVADO: 'Aprovado',
};

const fmt = (d: Date | null | undefined) => d ? d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

/**
 * A folha de UM inventário: para o gerente em RASCUNHO/EM_CORRECAO é a
 * contagem editável; para o auditor em PENDENTE é a auditoria; para todo o
 * resto (e para o PDF) é a relação só leitura, com os eventos embaixo.
 * `?imprimir=1` abre direto no diálogo de impressão.
 */
export default async function InventarioUtensilioPage({ params, searchParams }: { params: { id: string }; searchParams: { imprimir?: string } }) {
  const user = (await getSessionUser())!;
  const inv = await getInventario(user, params.id);
  if (!inv) notFound();
  const imprimir = searchParams.imprimir === '1';

  const edita = !imprimir && PODE_CONTAR.has(user.role) && EDITAVEL.has(inv.status);
  const audita = !imprimir && PODE_AUDITAR.has(user.role) && inv.status === 'PENDENTE';
  const responsaveis = edita ? await responsaveisDaUnidade(inv.unitId) : [];
  const div = contarDivergencias(inv.items);

  return (
    <div className={`space-y-4 ${imprimir ? 'sgo-print' : ''}`} data-testid="inventario-utensilios">
      {imprimir && <AutoPrint />}
      <Link href="/modulos/inventario-utensilios" className="inline-flex items-center gap-1 text-sm font-semibold text-brand print:hidden"><ArrowLeft className="h-4 w-4" /> Inventário de Utensílios</Link>
      <LargeTitle
        title={`Inventário de Utensílios — ${inv.unidade}`}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2">
          <StatusBadge tone={TOM_STATUS[inv.status]} dot>{ROTULO_STATUS[inv.status]}</StatusBadge>
          <span>Gerente: <b className="text-ink-900">{inv.managerName}</b></span>
          <span>· Aberto em {fmt(inv.createdAt)}</span>
          {inv.sentAt && <span>· Enviado em {fmt(inv.sentAt)}</span>}
          {inv.approvedAt && <span>· Aprovado em {fmt(inv.approvedAt)} por {inv.auditorName}</span>}
        </span>}
        actions={!imprimir && inv.status !== 'RASCUNHO' ? <a href={`/modulos/inventario-utensilios/${inv.id}?imprimir=1`} target="_blank" rel="noreferrer" className="sgo-btn sgo-btn--sm"><Printer className="h-4 w-4" /> PDF</a> : undefined}
      />

      {edita ? (
        <ContagemClient
          inventario={{ id: inv.id, unidade: inv.unidade, status: inv.status as 'RASCUNHO' | 'EM_CORRECAO', managerId: inv.managerId, notes: inv.notes, returnReason: inv.returnReason, items: inv.items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, custom: i.custom, note: i.note })) }}
          responsaveis={responsaveis.map((r) => ({ id: r.id, name: r.name }))}
        />
      ) : audita ? (
        <>
          {inv.notes && <section className="sgo-panel sgo-panel--solid p-3 sm:p-4"><p className="text-xs font-medium text-ink-500">Observações do gerente</p><p className="text-sm text-ink-900">{inv.notes}</p></section>}
          <AuditoriaClient inventarioId={inv.id} itens={inv.items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, auditedQuantity: i.auditedQuantity, custom: i.custom, note: i.note }))} observacaoAtual={inv.auditNotes} />
        </>
      ) : (
        <>
          {inv.status === 'EM_CORRECAO' && inv.returnReason && (
            <section className="sgo-panel sgo-panel--solid border-danger p-3 sm:p-4"><p className="text-xs font-medium text-danger">Devolvido para correção</p><p className="text-sm text-ink-900">{inv.returnReason}</p></section>
          )}
          <section className="sgo-panel sgo-panel--solid overflow-hidden" data-testid="itens-leitura">
            <p className="sgo-panel__title px-3 pt-3 sm:px-4">Utensílios · total <span className="tabular-nums">{inv.total.toLocaleString('pt-BR')}</span></p>
            <div className="overflow-x-auto">
              <table className="sgo-tbl w-full text-sm">
                <thead><tr><th className="text-left">Utensílio</th><th className="text-right">Informado</th>{div.conferidos > 0 && <><th className="text-right">Conferido</th><th className="text-right">Diferença</th></>}</tr></thead>
                <tbody>
                  {inv.items.map((i) => {
                    const d = diferenca(i.quantity, i.auditedQuantity);
                    return (
                      <tr key={i.id}>
                        <td className="whitespace-normal font-medium text-ink-900">{i.name}{i.custom && <span className="ml-2 text-xs font-normal text-ink-500">adicionado</span>}{i.note && <span className="block text-xs font-normal text-ink-500">{i.note}</span>}</td>
                        <td className="text-right tabular-nums">{i.quantity === null ? '—' : i.quantity.toLocaleString('pt-BR')}</td>
                        {div.conferidos > 0 && <>
                          <td className="text-right tabular-nums">{i.auditedQuantity === null ? '—' : i.auditedQuantity.toLocaleString('pt-BR')}</td>
                          <td className={`text-right tabular-nums font-semibold ${d === null ? 'text-ink-400' : d === 0 ? 'text-success' : 'text-danger'}`}>{d === null ? '—' : d > 0 ? `+${d}` : String(d)}</td>
                        </>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {div.conferidos > 0 && <p className="px-3 pb-3 text-xs text-ink-500 sm:px-4">{div.conferidos} item(ns) conferido(s) pelo auditor · {div.divergentes} com diferença.</p>}
          </section>
          {(inv.notes || inv.auditNotes) && (
            <section className="grid gap-3 sm:grid-cols-2">
              {inv.notes && <div className="sgo-panel sgo-panel--solid p-3 sm:p-4"><p className="text-xs font-medium text-ink-500">Observações do gerente</p><p className="text-sm text-ink-900">{inv.notes}</p></div>}
              {inv.auditNotes && <div className="sgo-panel sgo-panel--solid p-3 sm:p-4"><p className="text-xs font-medium text-ink-500">Observação de auditoria{inv.auditorName ? ` — ${inv.auditorName}` : ''}</p><p className="text-sm text-ink-900">{inv.auditNotes}</p></div>}
            </section>
          )}
        </>
      )}

      <section className="sgo-panel sgo-panel--solid overflow-hidden" data-testid="eventos">
        <p className="sgo-panel__title px-3 pt-3 sm:px-4">Histórico deste inventário</p>
        <ul className="divide-y divide-line">
          {inv.events.map((e) => (
            <li key={e.id} className="px-3 py-2 text-sm sm:px-4">
              <span className="font-medium text-ink-900">{ROTULO_EVENTO[e.kind] ?? e.kind}</span>
              <span className="text-ink-500"> · {fmt(e.createdAt)}{e.byName ? ` · ${e.byName}` : ''}</span>
              {e.note && <p className="text-xs text-ink-700">{e.note}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
