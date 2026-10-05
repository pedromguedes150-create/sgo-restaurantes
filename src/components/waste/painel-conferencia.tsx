import Link from 'next/link';
import { CalendarCheck, CalendarX, Camera, CameraOff, ClipboardCheck, Clock, Pencil } from 'lucide-react';
import { Card, CardContent, PanelHeader } from '@/components/sgo/panel';
import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import { FotosDoLancamento } from '@/components/waste/fotos-do-lancamento';
import { dataBR, type CelulaDoMapa } from '@/lib/waste/painel-calculo';
import { shortUnitName } from '@/lib/unit-name';
import type { getConferencia, LancamentoConferido } from '@/lib/waste/painel';

type Dados = Awaited<ReturnType<typeof getConferencia>>;
export type FiltroConferencia = 'todos' | 'sem-foto' | 'depois';

const TAG_FOTO: Record<LancamentoConferido['foto'], { cls: string; txt: string }> = {
  completa: { cls: 'sgo-tag sgo-tag--green', txt: 'Com foto' },
  parcial: { cls: 'sgo-tag sgo-tag--amber', txt: 'Foto incompleta' },
  'sem-foto': { cls: 'sgo-tag sgo-tag--amber', txt: 'Sem foto' },
  'sem-peso': { cls: 'sgo-tag sgo-tag--gray', txt: 'Sem peso' },
};

const CELULA: Record<Exclude<CelulaDoMapa, null>, { cls: string; titulo: string }> = {
  completa: { cls: 'bg-success', titulo: 'lançado com foto' },
  parcial: { cls: 'bg-warning', titulo: 'lançado, foto incompleta' },
  'sem-foto': { cls: 'bg-warning', titulo: 'lançado sem foto' },
  'sem-peso': { cls: 'bg-ink-400', titulo: 'lançado sem peso' },
};

/**
 * Aba CONFERÊNCIA do painel de desperdício (v1.152.0). Responde, para o mês:
 * quem lançou, quando, o quê, e se a FOTO bate com o número. O mapa unidade ×
 * dia mostra de uma vez os buracos (dia sem lançamento) e os dias sem foto;
 * cada ponto leva ao lançamento na lista abaixo.
 */
export function PainelConferencia({ d, filtro, linkFiltro, fotoObrigatoria }: {
  d: Dados;
  filtro: FiltroConferencia;
  linkFiltro: (f: FiltroConferencia) => string;
  fotoObrigatoria: boolean;
}) {
  const u = d.frente === 'restaurante' ? 'kg' : 'un.';
  const n = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: d.frente === 'restaurante' ? 3 : 0 });
  const r = d.resumo;
  const visiveis = d.lancamentos.filter((l) =>
    filtro === 'sem-foto' ? l.foto === 'sem-foto' || l.foto === 'parcial' : filtro === 'depois' ? l.depois : true,
  );
  const ancora = (unitId: string, date: string) => `l-${unitId}-${date}`;

  return (
    <div className="space-y-4" data-testid="painel-conferencia">
      <SgoKpis>
        <SgoKpi label="Lançamentos no mês" value={`${r.lancamentos}`} icon={CalendarCheck} tone="blue" meta={<>de {r.esperados} esperados (dias × unidades)</>} />
        <SgoKpi label="Dias sem lançamento" value={`${r.semLancamento}`} icon={CalendarX} tone={r.semLancamento ? 'amber' : 'green'} meta="ninguém lançou — não é zero de desperdício" />
        <SgoKpi label="Com foto completa" value={`${r.fotoCompleta}`} icon={Camera} tone="green" href={linkFiltro('todos')} />
        <SgoKpi label={d.frente === 'restaurante' && !fotoObrigatoria ? 'Sem foto (opcional por ora)' : 'Sem foto / incompleta'} value={`${r.fotoFaltando}`} icon={CameraOff}
          tone={r.fotoFaltando ? 'amber' : 'green'} href={linkFiltro('sem-foto')} testId="kpi-sem-foto" />
        <SgoKpi label="Lançados depois do dia" value={`${r.depois}`} icon={Clock} tone={r.depois ? 'amber' : 'gray'} href={linkFiltro('depois')} />
      </SgoKpis>

      <div className="sgo-panel overflow-hidden">
        <PanelHeader title="Mapa de lançamentos" icon={<ClipboardCheck className="h-4 w-4 text-brand" />} />
        <div className="overflow-x-auto px-3 pb-3 pt-2">
          {d.dias.length === 0 ? <p className="text-sm text-ink-500">O mês ainda não começou.</p> : (
            <table className="border-separate text-xs" style={{ borderSpacing: 3 }} data-testid="mapa-lancamentos">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-surface pr-2 text-left font-semibold text-ink-700">Unidade</th>
                  {d.dias.map((dia) => <th key={dia} className="w-5 text-center font-medium tabular-nums text-ink-500">{Number(dia.slice(8, 10))}</th>)}
                  <th className="pl-2 text-right font-semibold text-ink-700">Dias</th>
                </tr>
              </thead>
              <tbody>
                {d.mapa.map((linha) => (
                  <tr key={linha.unitId}>
                    <th scope="row" className="sticky left-0 z-10 max-w-40 truncate bg-surface pr-2 text-left font-medium text-ink-900">{shortUnitName(linha.unitName)}</th>
                    {linha.dias.map((c, i) => {
                      const dia = d.dias[i];
                      const titulo = `${shortUnitName(linha.unitName)} · ${dataBR(dia)} — ${c ? CELULA[c].titulo : 'sem lançamento'}`;
                      return (
                        <td key={dia} className="p-0 text-center">
                          {c ? (
                            <a href={`#${ancora(linha.unitId, dia)}`} title={titulo} aria-label={titulo} className={`block h-5 w-5 rounded ${CELULA[c].cls}`} />
                          ) : (
                            <span title={titulo} className="block h-5 w-5 rounded border border-dashed border-line-strong" />
                          )}
                        </td>
                      );
                    })}
                    <td className="pl-2 text-right font-semibold tabular-nums text-ink-900">{linha.lancados}/{d.dias.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-success" /> com foto</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-warning" /> sem foto / incompleta</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-ink-400" /> sem peso</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded border border-dashed border-line-strong" /> não lançou</span>
            <span>· toque num dia para ir ao lançamento</span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <span className="sgo-label">Mostrar</span>
        {([['todos', `Todos (${r.lancamentos})`], ['sem-foto', `Sem foto (${r.fotoFaltando})`], ['depois', `Lançados depois (${r.depois})`]] as const).map(([f, rot]) => (
          <Link key={f} href={linkFiltro(f)} className={`sgo-btn sgo-btn--sm ${filtro === f ? 'sgo-btn--primary' : ''}`} aria-current={filtro === f ? 'page' : undefined} data-testid={`filtro-${f}`}>{rot}</Link>
        ))}
      </div>

      {visiveis.length === 0 && (
        <Card><CardContent className="pt-4"><p className="text-sm text-ink-500">Nenhum lançamento {filtro === 'todos' ? 'no mês' : 'neste filtro'}.</p></CardContent></Card>
      )}

      <ul className="space-y-3" data-testid="lista-conferencia">
        {visiveis.map((l) => (
          <li key={l.id} id={ancora(l.unitId, l.date)} className="sgo-panel sgo-panel--solid scroll-mt-24 overflow-hidden">
            <div className="sgo-panel__hdr flex-wrap">
              <div className="sgo-panel__title">{dataBR(l.date)} · {shortUnitName(l.unitName)}</div>
              <span className={TAG_FOTO[l.foto].cls}>{TAG_FOTO[l.foto].txt}</span>
              {l.depois && <span className="sgo-tag sgo-tag--amber">Lançado depois do dia</span>}
              <span className="ml-auto font-bold tabular-nums text-brand">{n(l.total)} {u}</span>
            </div>
            <div className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0 space-y-2">
                <ul className="divide-y divide-line text-sm">
                  {l.linhas.map((x, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 py-1">
                      <span className="min-w-0 truncate text-ink-700">{x.rotulo}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-ink-900">{n(x.valor)} {u}</span>
                    </li>
                  ))}
                </ul>
                {l.faltamFotos.length > 0 && (
                  <p className="text-xs text-warning">Sem foto: {l.faltamFotos.join(' · ')}</p>
                )}
                {l.observacao && <p className="text-xs text-ink-500">Obs.: {l.observacao}</p>}
                <p className="text-xs text-ink-500">
                  Registrado por <b className="text-ink-700">{l.registradoPor ?? '—'}</b> em {l.registradoEm}
                  {l.atualizadoEm && <> · corrigido em {l.atualizadoEm}</>}
                </p>
                <Link href={`/modulos/desperdicios?aba=${d.frente}&unit=${l.unitId}&date=${l.date}`} className="sgo-btn sgo-btn--sm print:hidden">
                  <Pencil className="h-3.5 w-3.5" /> Abrir lançamento
                </Link>
              </div>
              <div className="md:max-w-xs">
                {l.fotos.length > 0
                  ? <FotosDoLancamento fotos={l.fotos} titulo={`${dataBR(l.date)} · ${shortUnitName(l.unitName)}`} />
                  : <p className="flex items-center gap-1.5 text-xs text-ink-500"><CameraOff className="h-4 w-4" /> Nenhuma foto neste lançamento.</p>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
