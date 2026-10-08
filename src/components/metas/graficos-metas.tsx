import type { ReactNode } from 'react';
import { arcoDaRosca, intervalosDaRosca, COR_FAIXA, ROTULO_FAIXA, type Composicao, type ResumoDoRanking } from '@/lib/metas/graficos';
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
          <span className="min-w-0 flex-1 leading-tight text-ink-700">{i.rotulo}</span>
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
    <div className="flex items-center gap-4" data-testid="rosca-meta">
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
    <div className="flex items-center gap-4" data-testid="rosca-unidades">
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
    <div className="flex items-center gap-4" data-testid="rosca-tarefas">
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
          <tfoot><tr className="font-semibold"><td>Total</td><td className="text-right tabular-nums">{c.pesoTotal}</td><td className="text-right tabular-nums">{c.tarefas.done}/{c.tarefas.resolved}</td><td className="text-right tabular-nums">{c.tarefas.pct == null ? '—' : `${c.tarefas.pct}%`}</td><td className="text-right tabular-nums text-success">{c.pontosGanhos.toLocaleString('pt-BR')}</td><td className="text-right tabular-nums text-danger">{c.pontosPerdidos ? c.pontosPerdidos.toLocaleString('pt-BR') : '—'}</td></tr></tfoot>
        </table>
        {c.informativas.map((l) => <p key={l.name} className="mt-2 text-xs text-danger">{l.name}: {l.resolved} lançamento(s) com data corrigida — desconto aplicado direto no % da meta.</p>)}
        {c.maioresPerdas.length > 0 && (
          <p className="mt-2 text-xs text-ink-700" data-testid="maiores-perdas">
            <b>Onde mais perdeu pontos:</b> {c.maioresPerdas.map((m) => `${m.name} (−${m.pontosPerdidos.toLocaleString('pt-BR')}, ${m.scorePct}%)`).join(' · ')}.
          </p>
        )}
      </div>
    </div>
  );
}
