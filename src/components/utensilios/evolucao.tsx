import Link from 'next/link';
import { SgoKpi, SgoKpis } from '@/components/sgo/sgo-kpi';
import { agruparPorUnidade, tendencia, type SerieDoLocal } from '@/lib/utensilios/evolucao';

/**
 * EVOLUÇÃO (v1.219.0) — a relação das quantidades de cada local, contagem a
 * contagem: o que diminuiu (quebras), o que aumentou (sobras) e se foi mais
 * ou menos que na comparação anterior. Só leitura; nenhuma conta da meta
 * passa por aqui.
 */

const n = (v: number) => v.toLocaleString('pt-BR');
const dia = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });

function frase(t: ReturnType<typeof tendencia>, antes: number | null, oQue: string): string {
  if (t === null || antes === null) return 'sem comparação anterior';
  if (t === 'igual') return `igual à comparação anterior (${n(antes)})`;
  return `${t} que na comparação anterior (${n(antes)} ${oQue})`;
}

export function EvolucaoDosUtensilios({ series, mostrarUnidade }: { series: SerieDoLocal[]; mostrarUnidade: boolean }) {
  if (series.length === 0) {
    return <section className="sgo-panel sgo-panel--solid p-3 text-sm text-ink-500 sm:p-4" data-testid="evolucao-vazia">Nenhum inventário enviado ainda. A evolução aparece a partir da primeira contagem enviada.</section>;
  }
  return (
    <div className="space-y-6" data-testid="evolucao-utensilios">
      <p className="text-xs text-ink-500">Cada contagem é comparada com a anterior do mesmo local. <b>Quebras</b> = o que diminuiu; <b>sobras</b> = o que aumentou (inclui reposição comprada — o SGO não separa compra de sobra).</p>
      {agruparPorUnidade(series).map((g) => (
        <div key={g.unitId} className="space-y-4">
          {mostrarUnidade && <h2 className="text-sm font-semibold text-ink-900">{g.unidade}</h2>}
          {g.series.map((s) => <Local key={s.chave} s={s} />)}
        </div>
      ))}
    </div>
  );
}

function Local({ s }: { s: SerieDoLocal }) {
  const c = s.comparacao;
  const tq = tendencia(s.anterior ? c.quebras : null, s.quebrasAntes);
  const ts = tendencia(s.anterior ? c.sobras : null, s.sobrasAntes);
  const maiorTotal = Math.max(1, ...s.pontos.map((p) => p.total));
  const maiorMov = Math.max(1, ...s.pontos.map((p) => Math.max(p.quebras ?? 0, p.sobras ?? 0)));
  const maiorItem = Math.max(1, ...c.linhas.map((l) => Math.max(l.atual ?? 0, l.anterior ?? 0)));
  return (
    <section className="space-y-3" data-testid="evolucao-local" data-local={s.local}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-ink-900">{s.local} <span className="font-normal text-ink-500">· última contagem em {dia(s.ultima.quando)} · {s.ultima.managerName}</span></p>
        <Link href={`/modulos/inventario-utensilios/${s.ultima.id}`} className="text-xs font-semibold text-brand">Abrir a contagem</Link>
      </div>

      <SgoKpis>
        <SgoKpi label="Total de utensílios" value={n(c.totalAtual)} meta={c.totalAnterior === null ? 'primeira contagem deste local' : `anterior: ${n(c.totalAnterior)}`} testId="kpi-total" />
        <SgoKpi label="Quebras" value={s.anterior ? n(c.quebras) : '—'} valueColor={s.anterior && c.quebras > 0 ? 'var(--sgo-bad)' : undefined} meta={s.anterior ? frase(tq, s.quebrasAntes, 'quebras') : 'a partir da 2ª contagem'} testId="kpi-quebras" />
        <SgoKpi label="Sobras" value={s.anterior ? n(c.sobras) : '—'} valueColor={s.anterior && c.sobras > 0 ? 'var(--sgo-ok)' : undefined} meta={s.anterior ? frase(ts, s.sobrasAntes, 'sobras') : 'a partir da 2ª contagem'} testId="kpi-sobras" />
        <SgoKpi label="Saldo" value={s.anterior ? `${c.saldo > 0 ? '+' : ''}${n(c.saldo)}` : '—'} meta="sobras − quebras" testId="kpi-saldo" />
      </SgoKpis>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="sgo-panel sgo-panel--solid p-3 sm:p-4" data-testid="grafico-total">
          <p className="sgo-panel__title">Total por contagem</p>
          <div className="mt-3 flex h-40 items-end gap-2">
            {s.pontos.map((p) => (
              <div key={p.id} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${p.rotulo}: ${n(p.total)}`}>
                <span className="text-xs font-semibold tabular-nums text-ink-700">{n(p.total)}</span>
                <div className="w-full rounded-t-md" style={{ height: `${Math.max(4, (p.total / maiorTotal) * 100)}%`, background: 'var(--sgo-brand)' }} />
                <span className="text-xs text-ink-500">{p.rotulo.slice(0, 5)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="sgo-panel sgo-panel--solid p-3 sm:p-4" data-testid="grafico-quebras-sobras">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="sgo-panel__title">Quebras × sobras por contagem</p>
            <p className="flex items-center gap-3 text-xs text-ink-500">
              <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: 'var(--sgo-bad)' }} /> Quebras</span>
              <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: 'var(--sgo-ok)' }} /> Sobras</span>
            </p>
          </div>
          {s.pontos.length < 2 ? <p className="mt-3 text-sm text-ink-500">Aparece a partir da segunda contagem deste local.</p> : (
            <div className="mt-3 flex h-40 items-end gap-2">
              {s.pontos.filter((p) => p.quebras !== null).map((p) => (
                <div key={p.id} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${p.rotulo}: ${n(p.quebras ?? 0)} quebras · ${n(p.sobras ?? 0)} sobras`}>
                  <span className="text-xs tabular-nums text-ink-700">{n(p.quebras ?? 0)} · {n(p.sobras ?? 0)}</span>
                  <div className="flex h-full w-full items-end justify-center gap-1">
                    <div className="w-1/2 rounded-t-md" style={{ height: `${Math.max(2, ((p.quebras ?? 0) / maiorMov) * 100)}%`, background: 'var(--sgo-bad)' }} />
                    <div className="w-1/2 rounded-t-md" style={{ height: `${Math.max(2, ((p.sobras ?? 0) / maiorMov) * 100)}%`, background: 'var(--sgo-ok)' }} />
                  </div>
                  <span className="text-xs text-ink-500">{p.rotulo.slice(0, 5)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="sgo-panel sgo-panel--solid overflow-hidden" data-testid="relacao-itens">
        <p className="sgo-panel__title px-3 pt-3 sm:px-4">Relação das quantidades{s.anterior ? ` · ${dia(s.ultima.quando)} × ${dia(s.anterior.quando)}` : ` · ${dia(s.ultima.quando)}`}</p>
        <div className="overflow-x-auto">
          <table className="sgo-tbl w-full text-sm">
            <thead><tr><th className="text-left">Utensílio</th><th className="text-left">Comparação</th><th className="text-right">Atual</th>{s.anterior && <><th className="text-right">Anterior</th><th className="text-right">Diferença</th></>}</tr></thead>
            <tbody>
              {c.linhas.map((l) => (
                <tr key={l.name}>
                  <td className="whitespace-normal font-medium text-ink-900">{l.name}</td>
                  <td className="min-w-[8rem]">
                    <div className="space-y-1">
                      <div className="h-2 rounded-full" style={{ width: `${Math.max(2, ((l.atual ?? 0) / maiorItem) * 100)}%`, background: 'var(--sgo-brand)' }} />
                      {s.anterior && <div className="h-2 rounded-full" style={{ width: `${Math.max(2, ((l.anterior ?? 0) / maiorItem) * 100)}%`, background: 'rgb(var(--sgo-ink-500-rgb) / 0.35)' }} />}
                    </div>
                  </td>
                  <td className="text-right tabular-nums font-semibold">{l.atual === null ? '—' : n(l.atual)}</td>
                  {s.anterior && <>
                    <td className="text-right tabular-nums text-ink-500">{l.anterior === null ? '—' : n(l.anterior)}</td>
                    <td className={`text-right tabular-nums font-semibold ${l.diff === null || l.diff === 0 ? 'text-ink-500' : l.diff < 0 ? 'text-danger' : 'text-success'}`}>{l.diff === null ? '—' : l.diff > 0 ? `+${n(l.diff)}` : n(l.diff)}</td>
                  </>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
