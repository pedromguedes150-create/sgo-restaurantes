import type { ReactNode } from 'react';
import Link from 'next/link';
import { arcoDaRosca, intervalosDaRosca, COR_FAIXA, ROTULO_FAIXA, faixaDaMeta, type Composicao, type ResumoDoRanking } from '@/lib/metas/graficos';
import { shortUnitName } from '@/lib/unit-name';

/**
 * Gráficos de rosca da tela de Metas (v1.163.0) — SVG puro, renderizado no
 * servidor, cores pelos tokens do tema. Cada rosca lê números já calculados
 * (`src/lib/metas/graficos.ts`); nenhuma regra de meta mora aqui.
 */
export interface FatiaUi { rotulo: string; valor: number; cor: string; detalhe?: string }

export function Rosca({ fatias, centro, sub, size = 168, espessura = 22, testId }: { fatias: FatiaUi[]; centro: ReactNode; sub?: ReactNode; size?: number; espessura?: number; testId?: string }) {
  const r = size / 2; const ri = r - espessura;
  const partes = intervalosDaRosca(fatias);
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} data-testid={testId}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={fatias.map((f) => `${f.rotulo}: ${f.valor}`).join(', ')}>
        <circle cx={r} cy={r} r={r - espessura / 2} fill="none" stroke="var(--sgo-sunken)" strokeWidth={espessura} />
        {/* O <title> do SVG precisa de UM nó de texto: com vários, o navegador
            junta tudo como texto cru e a hidratação não casa com o servidor. */}
        {partes.map((p) => <path key={p.rotulo} d={arcoDaRosca(r, r, r, ri, p.de, p.ate)} fill={p.cor} stroke="var(--sgo-surface)" strokeWidth={1.5}><title>{`${p.rotulo}: ${p.valor}${p.detalhe ? ` — ${p.detalhe}` : ''}`}</title></path>)}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="sgo-type-24 font-bold tabular-nums text-ink-900">{centro}</span>
        {sub && <span className="sgo-type-11 text-ink-500">{sub}</span>}
      </div>
    </div>
  );
}

export function Legenda({ itens }: { itens: { cor: string; rotulo: string; valor: ReactNode }[] }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {itens.map((i) => (
        <li key={i.rotulo} className="flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: i.cor }} aria-hidden />
          <span className="min-w-[8rem] flex-1 leading-tight text-ink-700">{i.rotulo}</span>
          <span className="shrink-0 font-semibold tabular-nums text-ink-900">{i.valor}</span>
        </li>
      ))}
    </ul>
  );
}

/** A meta da unidade: uma rosca com o % oficial, no tom do semáforo. */
export function RoscaDaMeta({ scorePct, rotulo, pontos }: { scorePct: number; rotulo: string; pontos?: { ganhos: number; total: number } }) {
  const cor = scorePct >= 80 ? COR_FAIXA.VERDE : scorePct >= 50 ? COR_FAIXA.AMBAR : COR_FAIXA.VERMELHO;
  return (
    <div className="flex flex-wrap items-center gap-4" data-testid="rosca-meta">
      <Rosca fatias={[{ rotulo: 'Atingido', valor: scorePct, cor }, { rotulo: 'Faltou', valor: 100 - scorePct, cor: 'transparent' }]} centro={`${scorePct}%`} sub="da meta" />
      <div className="min-w-0 space-y-1">
        <p className="sgo-type-15 font-semibold text-ink-900">{rotulo}</p>
        <p className="text-sm text-ink-700">{scorePct >= 80 ? 'Na meta.' : scorePct >= 50 ? 'Em atenção: abaixo de 80%.' : 'Crítico: abaixo de 50%.'}</p>
        {pontos && pontos.total > 0 && <p className="sgo-type-11 text-ink-500">{pontos.ganhos.toLocaleString('pt-BR')} de {pontos.total.toLocaleString('pt-BR')} pontos de peso conquistados.</p>}
      </div>
    </div>
  );
}

/** Quantas unidades estão em cada faixa do semáforo. */
export function RoscaDasUnidades({ resumo }: { resumo: ResumoDoRanking }) {
  const fatias = resumo.porFaixa.map((f) => ({ rotulo: ROTULO_FAIXA[f.faixa], valor: f.qtd, cor: COR_FAIXA[f.faixa], detalhe: f.unidades.map(shortUnitName).join(', ') }));
  return (
    <div className="flex flex-wrap items-center gap-4" data-testid="rosca-unidades">
      <Rosca fatias={fatias} centro={resumo.unidades} sub="unidades" />
      <div className="min-w-0 flex-1 space-y-2">
        <Legenda itens={resumo.porFaixa.map((f) => ({ cor: COR_FAIXA[f.faixa], rotulo: ROTULO_FAIXA[f.faixa], valor: f.qtd }))} />
        <p className="sgo-type-11 text-ink-500">
          Média da rede <b className="text-ink-700">{resumo.media ?? '—'}%</b> · mediana <b className="text-ink-700">{resumo.mediana ?? '—'}%</b>
          {resumo.melhor && <> · melhor {shortUnitName(resumo.melhor.name)} ({resumo.melhor.scorePct}%)</>}
          {resumo.pior && resumo.unidades > 1 && <> · menor {shortUnitName(resumo.pior.name)} ({resumo.pior.scorePct}%)</>}
        </p>
      </div>
    </div>
  );
}

/** Tarefas resolvidas no mês: realizadas × não realizadas, somando os componentes com peso. */
export function RoscaDasTarefas({ composicao }: { composicao: Composicao }) {
  const t = composicao.tarefas;
  return (
    <div className="flex flex-wrap items-center gap-4" data-testid="rosca-tarefas">
      <Rosca fatias={[{ rotulo: 'Realizadas', valor: t.done, cor: COR_FAIXA.VERDE }, { rotulo: 'Não realizadas', valor: t.missed, cor: COR_FAIXA.VERMELHO }]} centro={t.pct == null ? '—' : `${t.pct}%`} sub="realizadas" />
      <div className="min-w-0 flex-1 space-y-2">
        <Legenda itens={[{ cor: COR_FAIXA.VERDE, rotulo: 'Realizadas', valor: t.done }, { cor: COR_FAIXA.VERMELHO, rotulo: 'Não realizadas', valor: t.missed }]} />
        <p className="sgo-type-11 text-ink-500">{t.resolved} resolvida(s) no mês. Conta só o que entra na meta e já foi resolvido; pendentes ficam fora.</p>
      </div>
    </div>
  );
}

/**
 * Composição da meta: cada componente é uma fatia do tamanho do PESO, pintada
 * no tom do próprio resultado. A tabela ao lado mostra pontos ganhos/perdidos.
 */
export function RoscaDaComposicao({ composicao }: { composicao: Composicao }) {
  const c = composicao;
  const fatias = c.fatias.map((f) => ({ rotulo: f.name, valor: f.weight, cor: COR_FAIXA[f.faixa], detalhe: `${f.scorePct}% · ${f.pontosGanhos} de ${f.weight} pontos` }));
  return (
    <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-start" data-testid="rosca-composicao">
      <div className="flex flex-col items-center gap-2">
        <Rosca fatias={fatias} centro={c.pontosGanhos.toLocaleString('pt-BR')} sub={`de ${c.pesoTotal} pontos`} size={184} espessura={26} />
        <p className="sgo-type-11 text-center text-ink-500">Tamanho da fatia = peso do componente.<br />Cor = resultado dele no mês.</p>
      </div>
      <div className="min-w-0 overflow-x-auto">
        <table className="sgo-tbl w-full text-sm" data-testid="tabela-composicao">
          <thead><tr><th className="text-left">Componente</th><th className="text-right">Peso</th><th className="text-right">Realizado</th><th className="text-right">%</th><th className="text-right">Ganhos</th><th className="text-right">Perdidos</th></tr></thead>
          <tbody>
            {c.fatias.map((f) => (
              <tr key={f.name}>
                <td className="whitespace-nowrap"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: COR_FAIXA[f.faixa] }} aria-hidden />{f.name}</td>
                <td className="text-right tabular-nums">{f.weight}</td>
                <td className="text-right tabular-nums">{f.done}/{f.resolved}</td>
                <td className="text-right tabular-nums font-semibold">{f.scorePct}%</td>
                <td className="text-right tabular-nums text-success">{f.pontosGanhos.toLocaleString('pt-BR')}</td>
                <td className="text-right tabular-nums text-danger">{f.pontosPerdidos ? f.pontosPerdidos.toLocaleString('pt-BR') : '—'}</td>
              </tr>
            ))}
          </tbody>
          {c.observacoes.length > 0 && (
            <tbody data-testid="em-observacao">
              <tr><td colSpan={6} className="sgo-type-11 pt-3 font-semibold text-ink-500">Em observação — medido, mas NÃO conta na nota (status do componente na Configuração da Meta)</td></tr>
              {c.observacoes.map((o) => (
                <tr key={`obs-${o.name}`} className="text-xs text-ink-700">
                  <td className="whitespace-normal pl-6">
                    ↳ {o.name}
                    <span className="sgo-tag sgo-tag--amber ml-2">{o.status === 'HOMOLOGACAO' ? 'homologação' : 'monitoramento'}</span>
                    {o.notaSeContasse != null && <span className="block text-ink-500">Se contasse, a nota da unidade seria {o.notaSeContasse}%.</span>}
                  </td>
                  <td className="text-right tabular-nums text-ink-500">{o.weight || '—'}</td>
                  <td className="text-right tabular-nums">{o.done}/{o.resolved}</td>
                  <td className="text-right tabular-nums font-semibold">{o.scorePct}%</td>
                  <td className="text-right text-ink-400">—</td>
                  <td className="text-right text-ink-400">—</td>
                </tr>
              ))}
            </tbody>
          )}
          <tfoot><tr className="font-semibold"><td>Total</td><td className="text-right tabular-nums">{c.pesoTotal}</td><td className="text-right tabular-nums">{c.tarefas.done}/{c.tarefas.resolved}</td><td className="text-right tabular-nums">{c.tarefas.pct == null ? '—' : `${c.tarefas.pct}%`}</td><td className="text-right tabular-nums text-success">{c.pontosGanhos.toLocaleString('pt-BR')}</td><td className="text-right tabular-nums text-danger">{c.pontosPerdidos ? c.pontosPerdidos.toLocaleString('pt-BR') : '—'}</td></tr></tfoot>
        </table>
        {c.detalhes.length > 0 && (
          /* v1.222.0 — recolhido: a lista de todos os checklists empurrava o total para longe. */
          <details className="mt-2 rounded-lg border border-line" data-testid="detalhe-checklists">
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-ink-700">
              Por checklist ({c.detalhes.length}) — informativo: o peso é o de &quot;Checklists do dia&quot;, cada um vale igual
            </summary>
            <div className="overflow-x-auto">
              <table className="sgo-tbl w-full text-xs">
                <thead><tr><th className="text-left">Checklist</th><th className="text-right">Realizado</th><th className="text-right">%</th></tr></thead>
                <tbody>
                  {c.detalhes.map((d) => (
                    <tr key={`det-${d.name}`} className="text-ink-700">
                      <td className="whitespace-normal">↳ {d.name}</td>
                      <td className="text-right tabular-nums">{d.done}/{d.resolved}</td>
                      <td className={`text-right tabular-nums font-semibold ${d.scorePct >= 80 ? 'text-success' : d.scorePct >= 50 ? 'text-warning' : 'text-danger'}`}>{d.scorePct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
        {c.informativas.map((l) => <p key={l.name} className="mt-2 text-xs text-danger">{l.name} — desconto aplicado direto no % da meta.</p>)}
        {c.maioresPerdas.length > 0 && (
          <p className="mt-2 text-xs text-ink-700" data-testid="maiores-perdas">
            <b>Onde mais perdeu pontos:</b> {c.maioresPerdas.map((m) => `${m.name} (−${m.pontosPerdidos.toLocaleString('pt-BR')}, ${m.scorePct}%)`).join(' · ')}.
          </p>
        )}
      </div>
    </div>
  );
}

/** A linha da meta da rede: abaixo disso a unidade está fora da meta. */
const META_DA_REDE = 80;

export interface LinhaDoRanking { unitId: string; name: string; scorePct: number; href: string }

/**
 * RANKING DE METAS em gráfico (v1.223.0).
 *
 * À esquerda, a rosca da rede: quantas unidades estão em cada faixa, com a
 * média no centro. À direita, uma barra por unidade, da melhor para a pior, na
 * cor da faixa, com a linha da meta (80%) e a da média da rede — dá para ver
 * de relance quem passou, quem está perto e quanto falta. Cada linha abre a
 * unidade. Nada é recalculado: são as notas do ranking de sempre.
 *
 * Não é uma pizza das notas de propósito: as notas não são partes de um todo
 * (77% + 73% + … não somam nada), então fatias por unidade enganariam. O que é
 * parte de um todo — as unidades por faixa — é o que vai na rosca.
 */
export function RankingDeMetas({ ranking, resumo, selecionada }: { ranking: LinhaDoRanking[]; resumo: ResumoDoRanking; selecionada?: string | null }) {
  const fatias = resumo.porFaixa.map((f) => ({ rotulo: ROTULO_FAIXA[f.faixa], valor: f.qtd, cor: COR_FAIXA[f.faixa], detalhe: f.unidades.map(shortUnitName).join(', ') }));
  const media = resumo.media;
  const naMeta = resumo.porFaixa.find((f) => f.faixa === 'VERDE')?.qtd ?? 0;
  const podio = ranking.slice(0, 3);
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[18rem_1fr] lg:items-start" data-testid="ranking-de-metas">
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-2" data-testid="rosca-unidades">
          <Rosca fatias={fatias} centro={media == null ? '—' : `${media}%`} sub="média da rede" size={184} espessura={26} />
          <p className="sgo-type-11 text-center text-ink-500"><b className="text-ink-900">{naMeta}</b> de {resumo.unidades} unidade(s) na meta · mediana {resumo.mediana ?? '—'}%</p>
        </div>
        <Legenda itens={resumo.porFaixa.map((f) => ({ cor: COR_FAIXA[f.faixa], rotulo: ROTULO_FAIXA[f.faixa], valor: f.qtd }))} />
        {podio.length > 0 && (
          <ol className="grid grid-cols-3 gap-2" data-testid="podio">
            {podio.map((r, i) => (
              <li key={r.unitId}>
                <Link href={r.href} className="block rounded-lg border border-line bg-surface px-2 py-2 text-center hover:border-brand">
                  <span className="block text-xs font-bold text-ink-500">{i + 1}º</span>
                  <span className="block break-words text-xs font-semibold text-ink-900">{shortUnitName(r.name)}</span>
                  <span className="block text-sm font-bold tabular-nums" style={{ color: COR_FAIXA[faixaDaMeta(r.scorePct)] }}>{r.scorePct}%</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-0.5" style={{ background: 'var(--sgo-success)' }} aria-hidden /> meta {META_DA_REDE}%</span>
          {media != null && <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-0.5" style={{ background: 'var(--sgo-ink-500)' }} aria-hidden /> média da rede {media}%</span>}
          <span>toque na unidade para abrir</span>
        </div>
        <ol className="space-y-1" data-testid="barras-do-ranking">
          {ranking.map((r, i) => {
            const cor = COR_FAIXA[faixaDaMeta(r.scorePct)];
            const falta = META_DA_REDE - r.scorePct;
            const atual = r.unitId === selecionada;
            return (
              <li key={r.unitId}>
                <Link
                  href={r.href}
                  data-testid="barra-da-unidade"
                  aria-current={atual ? 'true' : undefined}
                  className={`grid grid-cols-[2rem_1fr_auto] items-center gap-x-2 gap-y-1 rounded-lg px-2 py-2 hover:bg-sunken sm:grid-cols-[2rem_11rem_1fr_auto] ${atual ? 'bg-brand-tint' : ''}`}
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-pill text-xs font-bold tabular-nums ${atual ? 'bg-brand text-on-brand' : 'bg-sunken text-ink-700'}`}>{i + 1}</span>
                  <span className="min-w-0 break-words text-sm font-semibold text-ink-900">{shortUnitName(r.name)}</span>
                  <span className="order-last col-span-3 sm:order-none sm:col-span-1">
                    <span className="relative block h-4 overflow-hidden rounded-pill bg-sunken" aria-hidden>
                      <span className="block h-full rounded-pill" style={{ width: `${Math.max(1, Math.min(100, r.scorePct))}%`, background: cor }} />
                      <span className="absolute inset-y-0 w-0.5" style={{ left: `${META_DA_REDE}%`, background: 'var(--sgo-success)' }} />
                      {media != null && <span className="absolute inset-y-0 w-0.5" style={{ left: `${Math.max(0, Math.min(100, media))}%`, background: 'var(--sgo-ink-500)' }} />}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm font-bold tabular-nums" style={{ color: cor }}>{r.scorePct}%</span>
                    <span className="block text-xs tabular-nums text-ink-500">{falta > 0 ? `faltam ${falta} p.p.` : 'na meta'}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
