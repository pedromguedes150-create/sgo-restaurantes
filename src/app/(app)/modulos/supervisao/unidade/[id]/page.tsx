import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertOctagon, ArrowLeft, CalendarCheck, CalendarClock, Flag, Gauge, Timer } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { abasDoPerfil } from '@/lib/permissions/abas-server';
import { getVisaoDaUnidade, podeConduzirVisita } from '@/lib/supervisor/operacional';
import { pctBR, ROTULO_SITUACAO } from '@/lib/supervisor/operacional-calculo';
import { LargeTitle } from '@/components/layout/page-chrome';
import { Card, CardContent, PanelHeader } from '@/components/sgo/panel';
import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import { IniciarVisita } from '@/components/supervisor/iniciar-visita';
import { shortUnitName } from '@/lib/unit-name';

export const dynamic = 'force-dynamic';

const br = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const SIT: Record<string, string> = { ABERTO: 'sgo-tag--gray', EM_ANDAMENTO: 'sgo-tag--blue', AGUARDANDO_VALIDACAO: 'sgo-tag--amber', RESOLVIDO: 'sgo-tag--green', VENCIDO: 'sgo-tag--red' };

/**
 * VISÃO DA UNIDADE (v1.155.0): "a unidade está melhorando ou piorando?" —
 * uso do SGO × aderência física lado a lado por mês, pendências e visitas.
 */
export default async function VisaoDaUnidadePage({ params }: { params: { id: string } }) {
  const user = (await getSessionUser())!;
  if ((await abasDoPerfil(user.role, 'SUPERVISION')).OPERACIONAL?.canView === false) notFound();
  const d = await getVisaoDaUnidade(user, params.id);
  if (!d) notFound();
  const ultimaAd = [...d.evolucao].reverse().find((e) => e.aderencia != null)?.aderencia ?? null;
  const vencidas = d.pendencias.filter((p) => p.situacao === 'VENCIDO').length;
  const criticas = d.pendencias.filter((p) => p.gravity === 'CRITICA').length;
  const max = 100;

  return (
    <div className="space-y-4" data-testid="visao-unidade">
      <Link href="/modulos/supervisao" className="inline-flex items-center gap-1 text-sm font-semibold text-brand"><ArrowLeft className="h-4 w-4" /> Rotina do Supervisor</Link>
      <LargeTitle title={shortUnitName(d.unidade.name)} subtitle="Uso do SGO × aderência operacional, pendências e visitas." actions={podeConduzirVisita(user) ? <IniciarVisita unitId={d.unidade.id} rotulo="Iniciar visita agora" primario /> : undefined} />

      <SgoKpis>
        <SgoKpi label="Uso do SGO (mês)" value={pctBR(d.evolucao.at(-1)?.uso)} icon={Gauge} tone="blue" meta="o que foi registrado" />
        <SgoKpi label="Aderência física (última)" value={pctBR(ultimaAd)} icon={Gauge} tone={ultimaAd == null ? 'gray' : ultimaAd >= 90 ? 'green' : ultimaAd >= 70 ? 'amber' : 'red'} meta="o que a visita conferiu" />
        <SgoKpi label="Última visita" value={br(d.ultima)} icon={CalendarCheck} tone="gray" />
        <SgoKpi label="Próxima visita" value={br(d.proxima)} icon={CalendarClock} tone="gray" />
        <SgoKpi label="Pendências" value={String(d.pendencias.length)} icon={Flag} tone={d.pendencias.length ? 'amber' : 'green'} />
        <SgoKpi label="Vencidas / críticas" value={`${vencidas} / ${criticas}`} icon={vencidas ? Timer : AlertOctagon} tone={vencidas || criticas ? 'red' : 'gray'} />
      </SgoKpis>

      <Card>
        <PanelHeader title="Evolução — 6 meses" />
        <CardContent className="pt-2">
          <div className="grid grid-cols-6 gap-2">
            {d.evolucao.map((e) => (
              <div key={e.ym} className="flex flex-col items-center gap-1 text-center">
                <div className="flex h-24 w-full items-end justify-center gap-1 rounded-md bg-sunken px-1">
                  <div className="w-1/2 rounded-t bg-ink-400" style={{ height: `${e.uso == null ? 0 : Math.max(3, (e.uso / max) * 100)}%` }} title={`Uso ${e.uso ?? '—'}%`} />
                  <div className="w-1/2 rounded-t bg-brand" style={{ height: `${e.aderencia == null ? 0 : Math.max(3, (e.aderencia / max) * 100)}%` }} title={`Aderência ${e.aderencia ?? '—'}%`} />
                </div>
                <span className="sgo-type-11 tabular-nums text-ink-700">{e.uso ?? '—'} / {e.aderencia ?? '—'}</span>
                <span className="sgo-type-11 text-ink-500">{MES[Number(e.ym.slice(5, 7)) - 1]}/{e.ym.slice(2, 4)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-500">Barra cinza = uso do SGO (%); barra bordô = aderência física nas visitas do mês (%). Mês sem visita fica sem a barra bordô — não é zero.</p>
        </CardContent>
      </Card>

      <div className="sgo-panel overflow-hidden">
        <PanelHeader title="Pendências do plano de ação" count={d.pendencias.length} />
        {d.pendencias.length === 0 ? <p className="p-4 text-sm text-ink-500">Nenhuma pendência aberta.</p> : (
          <div className="overflow-x-auto">
            <table className="sgo-tbl w-full text-sm">
              <thead><tr><th className="text-left">Problema</th><th className="text-left">Responsável</th><th className="text-left">Prazo</th><th className="text-left">Situação</th></tr></thead>
              <tbody>{d.pendencias.map((p) => (
                <tr key={p.id}><td>{p.problem}<span className="block text-xs text-ink-500">{p.category} · {p.gravity.toLowerCase()}{p.rejectedCount ? ` · reprovada ${p.rejectedCount}× na validação` : ''}</span></td><td>{p.responsibleName ?? '—'}</td><td className="tabular-nums">{br(p.dueDate)}</td><td><span className={`sgo-tag ${SIT[p.situacao]}`}>{ROTULO_SITUACAO[p.situacao]}</span></td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      <div className="sgo-panel overflow-hidden">
        <PanelHeader title="Visitas" count={d.visitas.length} />
        {d.visitas.length === 0 ? <p className="p-4 text-sm text-ink-500">Nenhuma visita registrada.</p> : (
          <ul className="divide-y divide-line">
            {d.visitas.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                <span className="w-24 tabular-nums text-ink-700">{br(v.data)}</span>
                <span className={`sgo-tag ${v.status === 'DONE' ? 'sgo-tag--green' : v.status === 'CANCELED' ? 'sgo-tag--gray' : 'sgo-tag--blue'}`}>{v.status === 'DONE' ? 'Concluída' : v.status === 'CANCELED' ? 'Cancelada' : 'Agendada'}</span>
                <span className="text-ink-700">{v.kind === 'OPERACIONAL' ? 'Operacional' : 'Simples'} · {v.supervisor}</span>
                {v.aderencia != null && <span className="font-semibold text-brand">{pctBR(v.aderencia)}</span>}
                {v.naoConformes != null && <span className="text-xs text-ink-500">{v.naoConformes} não conforme(s)</span>}
                {v.kind === 'OPERACIONAL' && <Link className="sgo-btn sgo-btn--sm ml-auto" href={`/modulos/supervisao/visita/${v.id}${v.status === 'DONE' ? '/resultado' : ''}`}>{v.status === 'DONE' ? 'Ver resultado' : 'Abrir'}</Link>}
                {v.kind === 'SIMPLES' && v.feedback && <span className="w-full text-xs text-ink-500">“{v.feedback}”</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
