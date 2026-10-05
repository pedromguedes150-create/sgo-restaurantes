import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertOctagon, ArrowLeft, CheckCircle2, ClipboardCheck, Download, Flag, Gauge, Repeat, XCircle } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { abasDoPerfil } from '@/lib/permissions/abas-server';
import { getVisitaOperacional } from '@/lib/supervisor/operacional';
import { pctBR, ROTULO_SITUACAO } from '@/lib/supervisor/operacional-calculo';
import { LargeTitle } from '@/components/layout/page-chrome';
import { Card, CardContent, PanelHeader } from '@/components/sgo/panel';
import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import { FotosDoLancamento } from '@/components/waste/fotos-do-lancamento';
import { PrintButton } from '@/components/ui/print-button';
import { shortUnitName } from '@/lib/unit-name';

export const dynamic = 'force-dynamic';

const br = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const RESP: Record<string, { t: string; c: string }> = { CONFORME: { t: 'Conforme', c: 'sgo-tag--green' }, NAO_CONFORME: { t: 'Não conforme', c: 'sgo-tag--red' }, NAO_SE_APLICA: { t: 'N/A', c: 'sgo-tag--gray' } };
const SIT: Record<string, string> = { ABERTO: 'sgo-tag--gray', EM_ANDAMENTO: 'sgo-tag--blue', AGUARDANDO_VALIDACAO: 'sgo-tag--amber', RESOLVIDO: 'sgo-tag--green', VENCIDO: 'sgo-tag--red' };

/** RESULTADO da visita operacional (v1.155.0) — tela e PDF (impressão) iguais. */
export default async function ResultadoDaVisitaPage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  if ((await abasDoPerfil(user.role, 'SUPERVISION')).OPERACIONAL?.canView === false) notFound();
  const d = await getVisitaOperacional(user, params.id);
  if (!d || !d.unidade) notFound();
  const a = d.resumo.aderencia;
  const ncs = d.respostas.filter((r) => r.answer === 'NAO_CONFORME');

  return (
    <div className="sgo-print space-y-4" data-testid="resultado-visita">
      <Link href={`/modulos/supervisao/unidade/${d.unidade.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-brand print:hidden"><ArrowLeft className="h-4 w-4" /> Visão da unidade</Link>
      <LargeTitle
        title={`Visita operacional · ${shortUnitName(d.unidade.name)}`}
        subtitle={`${br(d.visita.data)} · ${d.visita.supervisor} · ${d.visita.status === 'DONE' ? `concluída em ${br(d.visita.concluidaEm)}` : 'em andamento'}`}
        actions={(
          <>
            {d.visita.status === 'PLANNED' && <Link className="sgo-btn sgo-btn--primary" href={`/modulos/supervisao/visita/${d.visita.id}`}>Continuar visita</Link>}
            <a className="sgo-btn" href={`/api/supervision/operacional/export?visita=${d.visita.id}`}><Download className="h-3.5 w-3.5" /> Excel</a>
            <PrintButton />
          </>
        )}
      />

      <SgoKpis>
        <SgoKpi label="Aderência operacional" value={pctBR(a.pct)} icon={Gauge} tone={a.pct == null ? 'gray' : a.pct >= 90 ? 'green' : a.pct >= 70 ? 'amber' : 'red'} meta={`${a.pontosConformes} de ${a.pontosConferidos} pontos conferidos`} testId="kpi-aderencia" />
        <SgoKpi label="Itens verificados" value={String(a.respondidos)} icon={ClipboardCheck} tone="blue" meta={`de ${a.total} no roteiro${a.pendentes ? ` · ${a.pendentes} sem resposta` : ''}`} />
        <SgoKpi label="Conformes" value={String(a.conformes)} icon={CheckCircle2} tone="green" />
        <SgoKpi label="Não conformes" value={String(a.naoConformes)} icon={XCircle} tone={a.naoConformes ? 'red' : 'green'} meta={`${a.naoAplicaveis} não se aplica`} />
        <SgoKpi label="Críticos" value={String(a.criticos)} icon={AlertOctagon} tone={a.criticos ? 'red' : 'gray'} />
        <SgoKpi label="Reincidências" value={String(d.resumo.reincidencias)} icon={Repeat} tone={d.resumo.reincidencias ? 'amber' : 'gray'} meta="já apontadas em visita anterior" />
      </SgoKpis>
      <p className="text-xs text-ink-500">Aderência operacional = o que a visita conferiu no local. É diferente do uso do SGO (o que foi registrado) e não altera as metas.</p>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <PanelHeader title="Principais desvios" />
          <CardContent className="pt-2">
            {d.resumo.desvios.length === 0 ? <p className="text-sm text-ink-500">Nenhuma não conformidade.</p> : (
              <ol className="space-y-1 text-sm">{d.resumo.desvios.map((x, i) => <li key={x.secao} className="flex justify-between border-b border-line py-1"><span>{i + 1}. {x.secao}</span><b className="tabular-nums">{x.qtd}</b></li>)}</ol>
            )}
          </CardContent>
        </Card>
        <Card>
          <PanelHeader title="Pendências anteriores e plano de ação" icon={<Flag className="h-4 w-4 text-brand" />} />
          <CardContent className="space-y-1 pt-2 text-sm">
            <p>{d.resumo.pendenciasAnteriores.verificadas} verificada(s) nesta visita · {d.resumo.pendenciasAnteriores.resolvidas} resolvida(s) · {d.resumo.pendenciasAnteriores.permanecem} permanece(m)</p>
            <p>{d.resumo.acoes.abertas} ação(ões) aberta(s) no plano · {d.resumo.acoes.criticas} crítica(s)</p>
            {d.visita.feedback && <p className="pt-1 text-ink-700">“{d.visita.feedback}”</p>}
          </CardContent>
        </Card>
      </div>

      {ncs.length > 0 && (
        <div className="sgo-panel overflow-hidden">
          <PanelHeader title="Não conformidades" count={ncs.length} countTone="red" />
          <ul className="divide-y divide-line">
            {ncs.map((r) => (
              <li key={r.id} className="grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900">{r.text}</p>
                  <p className="text-xs text-ink-500">{r.section} · gravidade {r.gravity?.toLowerCase() ?? '—'}{r.mode === 'AMOSTRAGEM' && r.sampleChecked ? ` · ${r.sampleOk ?? 0}/${r.sampleChecked} conformes` : ''}{r.temperature != null ? ` · ${r.temperature} °C` : ''}</p>
                  {r.note && <p className="text-xs text-ink-700">{r.note}</p>}
                </div>
                {r.photos.length > 0 && <FotosDoLancamento fotos={r.photos.map((p, i) => ({ rotulo: `${r.section} ${i + 1}`, path: p }))} titulo={r.text} tamanho="sm" />}
              </li>
            ))}
          </ul>
        </div>
      )}

      {d.acoes.length > 0 && (
        <div className="sgo-panel overflow-hidden">
          <PanelHeader title="Plano de ação" count={d.acoes.length} />
          <div className="overflow-x-auto">
            <table className="sgo-tbl w-full text-sm">
              <thead><tr><th className="text-left">Problema</th><th className="text-left">Responsável</th><th className="text-left">Prazo</th><th className="text-left">Gravidade</th><th className="text-left">Situação</th></tr></thead>
              <tbody>{d.acoes.map((x) => (
                <tr key={x.id}><td>{x.problem}<span className="block text-xs text-ink-500">{x.category}{x.occurrenceId ? ' · ocorrência aberta' : ''}</span></td><td>{x.responsibleName ?? '—'}</td><td className="tabular-nums">{br(x.dueDate)}</td><td>{x.gravity.toLowerCase()}</td><td><span className={`sgo-tag ${SIT[x.situacao]}`}>{ROTULO_SITUACAO[x.situacao]}</span></td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      <details className="sgo-panel overflow-hidden" open>
        <summary className="sgo-panel__hdr cursor-pointer"><span className="sgo-panel__title">Todos os itens</span><span className="sgo-count">{d.respostas.length}</span></summary>
        <div className="overflow-x-auto">
          <table className="sgo-tbl w-full text-sm">
            <thead><tr><th className="text-left">Seção</th><th className="text-left">Item</th><th className="text-left">Resposta</th></tr></thead>
            <tbody>{d.respostas.map((r) => (
              <tr key={r.id}><td className="text-ink-700">{r.section}</td><td>{r.text}</td><td>{r.answer ? <span className={`sgo-tag ${RESP[r.answer].c}`}>{RESP[r.answer].t}</span> : <span className="text-xs text-ink-500">sem resposta</span>}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
