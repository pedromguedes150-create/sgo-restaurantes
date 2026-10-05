import Link from 'next/link';
import { AlertOctagon, CalendarX, ClipboardCheck, Flag, Gauge, Repeat, Timer, TrendingUp } from 'lucide-react';
import { Card, CardContent, PanelHeader } from '@/components/sgo/panel';
import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import { IniciarVisita } from '@/components/supervisor/iniciar-visita';
import { shortUnitName } from '@/lib/unit-name';
import type { getIndicadoresOperacionais } from '@/lib/supervisor/operacional';
import { pctBR } from '@/lib/supervisor/operacional-calculo';

type Dados = Awaited<ReturnType<typeof getIndicadoresOperacionais>>;
const br = (iso: string | null | undefined) => (iso ? iso.split('-').reverse().join('/') : '—');
const TIPO: Record<string, string> = { RESTAURANTE: 'Restaurante', LANCHONETE: 'Lanchonete', CD: 'CD', FABRICA: 'Fábrica' };

function Delta({ atual, anterior, invertido = false, sufixo = '' }: { atual: number | null; anterior: number | null; invertido?: boolean; sufixo?: string }) {
  if (atual == null || anterior == null) return <span className="text-ink-500">mês anterior: {anterior ?? '—'}{anterior != null ? sufixo : ''}</span>;
  const d = Math.round((atual - anterior) * 10) / 10;
  if (d === 0) return <span className="text-ink-500">igual ao mês anterior</span>;
  const bom = invertido ? d < 0 : d > 0;
  return <span className={bom ? 'font-semibold text-success' : 'font-semibold text-danger'}>{d > 0 ? '▲' : '▼'} {Math.abs(d)}{sufixo} vs mês anterior</span>;
}

/**
 * Aba ACOMPANHAMENTO OPERACIONAL (v1.155.0): a rede pelo que a VISITA conferiu,
 * ao lado do uso do SGO (o que foi registrado). Ranking não é "quem tem menos
 * problema": unidade sem visita no mês aparece separada, sem nota.
 */
export function PainelOperacional({ d, emAndamento, planejadas, podeConduzir }: {
  d: Dados;
  emAndamento: { id: string; unitName: string; data: string; respondidos: number; total: number }[];
  planejadas: { id: string; unitName: string; data: string }[];
  podeConduzir: boolean;
}) {
  const r = d.rede;
  const comVisita = d.linhas.filter((l) => l.visitas > 0).sort((a, b) => (a.aderencia ?? 101) - (b.aderencia ?? 101));
  const semVisita = d.linhas.filter((l) => l.visitas === 0);
  return (
    <div className="space-y-4" data-testid="painel-operacional">
      <SgoKpis>
        <SgoKpi label="Aderência operacional da rede" value={pctBR(r.atual.aderencia)} icon={Gauge} tone="blue" meta={<Delta atual={r.atual.aderencia} anterior={r.anteriorMes.aderencia} sufixo=" p.p." />} testId="kpi-aderencia-rede" />
        <SgoKpi label="Visitas no mês" value={String(r.atual.visitas)} icon={ClipboardCheck} tone="green" meta={`${r.atual.unidadesVisitadas} de ${r.unidades} unidades`} />
        <SgoKpi label="Unidades sem visita" value={String(r.semVisita)} icon={CalendarX} tone={r.semVisita ? 'amber' : 'green'} meta="no mês — ficam fora do ranking" />
        <SgoKpi label="Não conformidades" value={String(r.atual.naoConformes)} icon={AlertOctagon} tone={r.atual.naoConformes ? 'red' : 'gray'} meta={<Delta atual={r.atual.naoConformes} anterior={r.anteriorMes.naoConformes} invertido />} />
        <SgoKpi label="Críticas" value={String(r.atual.criticos)} icon={AlertOctagon} tone={r.atual.criticos ? 'red' : 'gray'} />
        <SgoKpi label="Ações vencidas" value={String(r.acoesVencidas)} icon={Timer} tone={r.acoesVencidas ? 'red' : 'gray'} meta={`${r.acoesAbertas} aberta(s) no total`} />
        <SgoKpi label="Reincidências" value={String(r.atual.reincidencias)} icon={Repeat} tone={r.atual.reincidencias ? 'amber' : 'gray'} meta="já apontadas antes" />
        <SgoKpi label="Taxa de resolução" value={pctBR(r.taxaResolucao)} icon={TrendingUp} tone="green" meta="ações validadas ÷ abertas (todas)" />
      </SgoKpis>

      {(emAndamento.length > 0 || planejadas.length > 0) && podeConduzir && (
        <Card>
          <PanelHeader title="Visitas para fazer" count={emAndamento.length + planejadas.length} />
          <CardContent className="space-y-2 pt-2">
            {emAndamento.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="sgo-tag sgo-tag--amber">Em andamento</span>
                <span className="font-medium text-ink-900">{shortUnitName(v.unitName)}</span>
                <span className="text-ink-500">{br(v.data)} · {v.respondidos}/{v.total} itens</span>
                <Link className="sgo-btn sgo-btn--sm sgo-btn--primary ml-auto" href={`/modulos/supervisao/visita/${v.id}`}>Continuar</Link>
              </div>
            ))}
            {planejadas.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="sgo-tag sgo-tag--blue">Agendada</span>
                <span className="font-medium text-ink-900">{shortUnitName(v.unitName)}</span>
                <span className="text-ink-500">{br(v.data)}</span>
                <span className="ml-auto"><IniciarVisita visitId={v.id} rotulo="Iniciar acompanhamento" /></span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="sgo-panel overflow-hidden">
        <PanelHeader title="Unidades — uso do SGO × aderência operacional" count={d.linhas.length} />
        <div className="overflow-x-auto">
          <table className="sgo-tbl w-full text-sm" data-testid="tabela-unidades-op">
            <thead>
              <tr>
                <th className="text-left">Unidade</th>
                <th className="text-right">Uso do SGO</th>
                <th className="text-right">Aderência física</th>
                <th className="text-right">Visitas</th>
                <th className="text-right">Não conf.</th>
                <th className="text-right">Críticas</th>
                <th className="text-right">Reincid.</th>
                <th className="text-right">Ações (venc.)</th>
                <th className="text-left">Última / próxima</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...comVisita, ...semVisita].map((l) => (
                <tr key={l.unitId}>
                  <td><Link href={`/modulos/supervisao/unidade/${l.unitId}`} className="font-medium text-ink-900 hover:text-brand hover:underline">{shortUnitName(l.nome)}</Link><span className="block text-xs text-ink-500">{TIPO[l.operationType] ?? l.operationType}</span></td>
                  <td className="text-right tabular-nums">{pctBR(l.usoPct)}</td>
                  <td className="text-right font-semibold tabular-nums">{l.visitas ? pctBR(l.aderencia) : <span className="text-xs font-normal text-ink-500">sem visita</span>}</td>
                  <td className="text-right tabular-nums">{l.visitas}</td>
                  <td className="text-right tabular-nums">{l.visitas ? l.naoConformes : '—'}</td>
                  <td className={`text-right tabular-nums ${l.criticos ? 'font-semibold text-danger' : ''}`}>{l.visitas ? l.criticos : '—'}</td>
                  <td className="text-right tabular-nums">{l.visitas ? l.reincidencias : '—'}</td>
                  <td className="text-right tabular-nums">{l.acoesAbertas}{l.acoesVencidas ? <span className="text-danger"> ({l.acoesVencidas})</span> : ''}</td>
                  <td className="text-xs tabular-nums text-ink-700">{br(l.ultimaVisita)} / {br(l.proximaVisita)}</td>
                  <td className="text-right">{podeConduzir && <IniciarVisita unitId={l.unitId} rotulo="Visitar agora" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 pb-3 pt-2 text-xs text-ink-500">
          <b>Uso do SGO</b> = o que a unidade registrou no sistema. <b>Aderência física</b> = o que a visita conferiu no local (conformes ÷ conferidos, N/A fora). São coisas diferentes: 96% de preenchimento não é 96% de execução. As metas não mudam.
        </p>
      </div>

      <Card>
        <PanelHeader title="Principais desvios da rede (mês)" icon={<Flag className="h-4 w-4 text-brand" />} />
        <CardContent className="pt-2">
          {d.desvios.length === 0 ? <p className="text-sm text-ink-500">Nenhuma não conformidade registrada em visita neste mês.</p> : (
            <ol className="space-y-1 text-sm">{d.desvios.map((x, i) => <li key={x.secao} className="flex justify-between border-b border-line py-1"><span>{i + 1}. {x.secao}</span><b className="tabular-nums">{x.qtd}</b></li>)}</ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
