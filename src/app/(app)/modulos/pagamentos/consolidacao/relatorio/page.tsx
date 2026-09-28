import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { permissoesEfetivasDoRequest } from '@/lib/permissions';
import { PrintButton } from '@/components/ui/print-button';
import { AutoPrint } from '@/components/shared/auto-print';
import { formatBRL } from '@/lib/utils';
import { hojeNaOperacao } from '@/lib/controle-gerentes-dados';
import {
  getConsolidacaoPagamentos, getRecorrenciaFreelancers, unidadesDaConsolidacao, lerFiltro, queryDoFiltro, entraNosTotais, emBR, textoHoras,
  STATUS_CONS, STATUS_TEXTO, TIPO_TEXTO, TIPOS_CONS,
} from '@/lib/payments/consolidacao';

export const dynamic = 'force-dynamic';

/**
 * CONSOLIDAÇÃO DE PAGAMENTOS — a folha executiva para o Financeiro (PDF pela
 * impressão). Mesmos filtros e mesma conta da tela; os lançamentos saem
 * AGRUPADOS POR UNIDADE, cada uma com o seu subtotal. Imprimir não grava nada.
 */
export default async function RelatorioConsolidacaoPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const user = (await getSessionUser())!;
  const perms = await permissoesEfetivasDoRequest(user.role);
  if (!perms.PAYMENTS_CONSOLIDATION?.canView) return <p className="text-sm text-ink-500">Acesso restrito.</p>;

  const filtro = lerFiltro({ get: (k) => searchParams[k] ?? null });
  if (filtro.aba === 'recorrencia') return <FolhaDeRecorrencia user={user} filtro={filtro} imprimir={searchParams.imprimir === '1'} />;
  const c = await getConsolidacaoPagamentos(user, filtro);
  const r = c.resumo;
  const filtros = [
    c.unidades.find((u) => u.id === filtro.unitId)?.name ?? 'Todas as unidades',
    `Tipo: ${TIPOS_CONS.find((t) => t.value === filtro.tipo)?.label}`,
    `Status: ${STATUS_CONS.find((s) => s.value === filtro.status)?.label}`,
    ...(filtro.pessoa ? [`Colaborador: ${c.pessoas.find((p) => p.value === filtro.pessoa)?.label ?? '—'}`] : []),
  ].join(' · ');

  return (
    <div className="sgo-print mx-auto max-w-4xl space-y-5 bg-surface p-4 text-ink-900 print:p-0">
      {searchParams.imprimir === '1' && <AutoPrint />}
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href={`/modulos/pagamentos/consolidacao?${queryDoFiltro(filtro)}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Consolidação</Link>
        <PrintButton label="Salvar PDF" />
      </div>

      <header className="border-b-4 border-brand pb-3">
        <p className="sgo-type-11 font-semibold text-brand">GRUPO BEIJA-FLOR</p>
        <h1 className="text-2xl font-bold text-ink-900">CONSOLIDAÇÃO DE PAGAMENTOS</h1>
        <p className="text-sm text-ink-700">Período: <b>{c.periodo.rotulo}</b> (data do serviço)</p>
        <p className="text-xs text-ink-500">Filtros utilizados: {filtros} · emitido em {emBR(hojeNaOperacao())}</p>
      </header>

      <section>
        <h2 className="sgo-type-15 mb-2 font-bold text-brand">RESUMO DO PERÍODO</h2>
        <table className="w-full max-w-md text-sm">
          <tbody className="divide-y divide-line">
            <tr><td className="py-1">Freelancers</td><td className="py-1 text-right tabular-nums">{r.freelancers}</td><td className="py-1 text-right tabular-nums">{formatBRL(r.valorFreelancer)}</td></tr>
            <tr><td className="py-1">Horas Extras</td><td className="py-1 text-right tabular-nums">{r.horasExtras}</td><td className="py-1 text-right tabular-nums">{formatBRL(r.valorHoraExtra)}</td></tr>
            <tr><td className="py-1">Vale-transporte (já dentro dos valores)</td><td /><td className="py-1 text-right tabular-nums">{formatBRL(r.vt)}</td></tr>
            <tr className="font-bold"><td className="py-1">TOTAL GERAL · solicitações</td><td className="py-1 text-right tabular-nums">{r.solicitacoes}</td><td className="py-1 text-right tabular-nums">{formatBRL(r.total)}</td></tr>
          </tbody>
        </table>
        {filtro.status === 'TODOS' && (
          <p className="mt-1 text-xs text-ink-700">
            Solicitado — pendente: <b>{formatBRL(r.porStatus.pendente)}</b> · Aprovado — a pagar: <b>{formatBRL(r.porStatus.aprovado)}</b> · Pago: <b>{formatBRL(r.porStatus.pago)}</b>
          </p>
        )}
        {r.fora.qtd > 0 && <p className="mt-1 text-xs text-ink-500">{r.fora.qtd} rejeitada(s) ({formatBRL(r.fora.valor)}) listada(s) e fora dos totais.</p>}
        {filtro.status === 'TODOS' && r.pendentes.qtd > 0 && <p className="mt-1 text-xs font-semibold text-warning">Atenção: {r.pendentes.qtd} pendente(s) de aprovação ({formatBRL(r.pendentes.valor)}) dentro do total.</p>}
      </section>

      {c.porUnidade.length === 0 && <p className="text-sm text-ink-500">Nenhum lançamento com esses filtros no período.</p>}

      {c.porUnidade.map((u) => (
        <section key={u.unitId} className="break-inside-avoid-page">
          <h2 className="sgo-type-15 mb-1 border-b-2 border-brand pb-1 font-bold text-ink-900">{u.unidade.toUpperCase()}</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line text-left text-ink-500">
                <th className="py-1 pr-2 font-semibold">Data</th>
                <th className="py-1 pr-2 font-semibold">Tipo</th>
                <th className="py-1 pr-2 font-semibold">Colaborador</th>
                <th className="py-1 pr-2 text-right font-semibold">Horas</th>
                <th className="py-1 pr-2 text-right font-semibold">VT</th>
                <th className="py-1 pr-2 text-right font-semibold">Valor</th>
                <th className="py-1 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {u.lancamentos.map((l) => {
                const soma = entraNosTotais(l, filtro.status);
                return (
                  <tr key={l.id} className={soma ? '' : 'text-ink-400'}>
                    <td className="py-1 pr-2 tabular-nums">{emBR(l.data)}</td>
                    <td className="py-1 pr-2">{TIPO_TEXTO[l.tipo]}</td>
                    <td className="py-1 pr-2">{l.pessoa}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{textoHoras(l.horas)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{formatBRL(l.vt)}</td>
                    <td className={`py-1 pr-2 text-right tabular-nums ${soma ? '' : 'line-through'}`}>{formatBRL(l.valor)}</td>
                    <td className="py-1">{STATUS_TEXTO[l.status]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-1 text-right text-sm">
            Freelancer {formatBRL(u.freelancer)} · Hora Extra {formatBRL(u.horaExtra)} · VT {formatBRL(u.vt)} (já dentro) · <b>Subtotal {u.unidade}: {formatBRL(u.total)}</b>
          </p>
        </section>
      ))}

      {c.porUnidade.length > 0 && (
        <div className="border-t-4 border-brand pt-2 text-right text-sm">
          <p>TOTAL FREELANCER: <b>{formatBRL(r.valorFreelancer)}</b> · TOTAL HORA EXTRA: <b>{formatBRL(r.valorHoraExtra)}</b> · TOTAL VALE-TRANSPORTE (já dentro): <b>{formatBRL(r.vt)}</b></p>
          <p className="text-lg font-bold">TOTAL GERAL DA REDE: {formatBRL(r.total)}</p>
        </div>
      )}
      <p className="text-center text-[10px] text-ink-500">Valor = valor da solicitação (já inclui o vale-transporte lançado). Gerado pelo SGO Beija Flor — este documento não altera o status de nenhum pagamento.</p>
    </div>
  );
}

/**
 * RECORRÊNCIA DE FREELANCERS — a folha para Gestão/Diretoria (v1.127.0).
 * Mesma leitura da tela (`getRecorrenciaFreelancers`); imprimir não grava nada.
 */
async function FolhaDeRecorrencia({ user, filtro, imprimir }: {
  user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;
  filtro: ReturnType<typeof lerFiltro>;
  imprimir: boolean;
}) {
  const rc = await getRecorrenciaFreelancers(user, filtro);
  const unidade = (await unidadesDaConsolidacao(user)).find((u) => u.id === filtro.unitId)?.name ?? 'Todas as unidades';
  const t = rc.totais;
  return (
    <div className="sgo-print mx-auto max-w-4xl space-y-5 bg-surface p-4 text-ink-900 print:p-0">
      {imprimir && <AutoPrint />}
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href={`/modulos/pagamentos/consolidacao?${queryDoFiltro(filtro)}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Consolidação</Link>
        <PrintButton label="Salvar PDF" />
      </div>
      <header className="border-b-4 border-brand pb-3">
        <p className="sgo-type-11 font-semibold text-brand">GRUPO BEIJA-FLOR</p>
        <h1 className="text-2xl font-bold text-ink-900">RECORRÊNCIA DE FREELANCERS</h1>
        <p className="text-sm text-ink-700">Período: <b>{rc.periodo.rotulo}</b> · {unidade}</p>
        <p className="text-xs text-ink-500">Recorrente = mais de {rc.limiteSemanal} solicitações do mesmo freelancer numa semana (segunda a domingo) · emitido em {emBR(hojeNaOperacao())}</p>
      </header>
      {rc.linhas.length === 0 ? (
        <p className="text-sm text-ink-500">Nenhum freelancer passou do limite semanal no período.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-brand text-left text-ink-500">
              <th className="py-1 pr-2 font-semibold">Freelancer</th>
              <th className="py-1 pr-2 font-semibold">Unidade</th>
              <th className="py-1 pr-2 font-semibold">Semana</th>
              <th className="py-1 pr-2 text-right font-semibold">Solicitações</th>
              <th className="py-1 text-right font-semibold">Valor total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rc.linhas.map((g) => (
              <tr key={g.chave}>
                <td className="py-1 pr-2 font-medium">{g.nome}</td>
                <td className="py-1 pr-2">{g.unidades.join(', ')}</td>
                <td className="py-1 pr-2 tabular-nums">{emBR(g.semanaDe)} a {emBR(g.semanaAte)}</td>
                <td className="py-1 pr-2 text-right tabular-nums">{g.solicitacoes}</td>
                <td className="py-1 text-right tabular-nums">{formatBRL(g.valor)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-brand font-bold">
              <td className="py-1 pr-2" colSpan={3}>TOTAL · {t.freelancers} freelancer(s) recorrente(s)</td>
              <td className="py-1 pr-2 text-right tabular-nums">{t.solicitacoes}</td>
              <td className="py-1 text-right tabular-nums">{formatBRL(t.valor)}</td>
            </tr>
          </tfoot>
        </table>
      )}
      <p className="text-center text-[10px] text-ink-500">Gerado pelo SGO Beija Flor — este documento não altera o status de nenhum pagamento.</p>
    </div>
  );
}
