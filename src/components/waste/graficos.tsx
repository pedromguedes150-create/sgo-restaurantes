import * as React from 'react';
import type { Direcao } from '@/lib/waste/painel-calculo';

/**
 * Gráficos do painel de desperdício (v1.152.0) — SVG puro, sem biblioteca e sem
 * JavaScript no navegador: renderizam no servidor, saem iguais na impressão e
 * pegam a cor dos tokens (`currentColor` + classe de texto), então seguem o
 * tema claro/escuro e a identidade bordô.
 */

const fmt = (n: number, casas = 1) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas });

/** Seta + % com a cor certa. Em desperdício, SUBIR é ruim (vermelho). */
export function Variacao({ v, d }: { v: number | null; d: Direcao }) {
  if (d === 'sem-base' || v === null) return <span className="text-ink-500">sem base</span>;
  if (d === 'estavel') return <span className="font-semibold text-ink-700">● estável ({v > 0 ? '+' : ''}{fmt(v)}%)</span>;
  return (
    <span className={d === 'subiu' ? 'font-semibold text-danger' : 'font-semibold text-success'}>
      {d === 'subiu' ? '▲' : '▼'} {fmt(Math.abs(v))}%
    </span>
  );
}

const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const diaDaSemana = (iso: string) => new Date(iso + 'T12:00:00Z').getUTCDay();

/**
 * Colunas por dia do mês (v1.225.0) — altura FIXA, cantos arredondados, fim de
 * semana sombreado, o pico com o valor em cima e a média do mês anterior como
 * linha tracejada. Dia sem lançamento fica vazio com um ponto no pé (falta de
 * dado, não zero de desperdício).
 *
 * Era um SVG esticado à largura do painel: num monitor largo a figura passava
 * de meia tela de altura e as colunas viravam borrões no rodapé.
 */
export function BarrasDiarias({ pontos, referencia, unidade, rotuloReferencia }: {
  pontos: { date: string; total: number; lancamentos: number }[];
  referencia: number | null;
  unidade: string;
  rotuloReferencia?: string;
}) {
  if (pontos.length === 0) return <p className="text-sm text-ink-500">O mês ainda não começou.</p>;
  const max = Math.max(1, referencia ?? 0, ...pontos.map((p) => p.total)) * 1.12;
  const pico = pontos.reduce((m, p) => (p.total > m.total ? p : m), pontos[0]);
  const pct = (v: number) => (v / max) * 100;
  return (
    <figure className="w-full" role="img" aria-label={'Desperdício por dia (' + unidade + ')'} data-testid="barras-diarias">
      <div className="relative h-48">
        {[25, 50, 75].map((g) => <span key={g} className="absolute inset-x-0 border-t border-line" style={{ bottom: g + '%' }} aria-hidden />)}
        {referencia !== null && referencia > 0 && (
          <span className="absolute inset-x-0 z-10 border-t-2 border-dashed border-ink-500" style={{ bottom: pct(referencia) + '%' }}>
            <span className="absolute -top-5 right-0 rounded-pill bg-surface px-2 text-xs font-semibold text-ink-700">{rotuloReferencia ?? 'média do mês anterior'} · {fmt(referencia)} {unidade}</span>
          </span>
        )}
        <div className="absolute inset-0 flex items-end gap-0.5 sm:gap-1">
          {pontos.map((p) => {
            const fds = [0, 6].includes(diaDaSemana(p.date));
            const ehPico = p === pico && p.total > 0;
            return (
              <div key={p.date} className={'relative flex h-full min-w-0 flex-1 items-end rounded-md ' + (fds ? 'bg-sunken' : '')}
                title={p.date.slice(8, 10) + '/' + p.date.slice(5, 7) + ' — ' + (p.lancamentos ? fmt(p.total, 3) + ' ' + unidade + ' (' + p.lancamentos + ' lançamento' + (p.lancamentos > 1 ? 's' : '') + ')' : 'sem lançamento')}>
                {p.lancamentos > 0 ? (
                  <div className={'relative w-full rounded-t-md ' + (ehPico ? 'bg-brand' : 'bg-brand/70')} style={{ height: Math.max(2, pct(p.total)) + '%' }}>
                    {ehPico && <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-bold tabular-nums text-ink-900">{fmt(p.total)}</span>}
                  </div>
                ) : (
                  <div className="mx-auto mb-0.5 h-1 w-1 rounded-pill bg-line-strong" />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-1 flex gap-0.5 sm:gap-1" aria-hidden>
        {pontos.map((p) => {
          const dia = Number(p.date.slice(8, 10));
          const sempre = dia === 1 || dia % 5 === 0;
          return (
            <span key={p.date} className="min-w-0 flex-1 text-center">
              <span className={'block sgo-type-11 tabular-nums text-ink-700 ' + (sempre ? '' : 'hidden lg:block')}>{dia}</span>
              <span className="hidden sgo-type-11 text-ink-400 lg:block">{SEMANA[diaDaSemana(p.date)]}</span>
            </span>
          );
        })}
      </div>
    </figure>
  );
}

/** Colunas por mês com o valor em cima (a tendência de 6 meses). */
export function ColunasMensais({ pontos, unidade }: { pontos: { rotulo: string; valor: number; destaque?: boolean; nota?: string }[]; unidade: string }) {
  const max = Math.max(1, ...pontos.map((p) => p.valor));
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${pontos.length}, minmax(0, 1fr))` }}>
      {pontos.map((p) => (
        <div key={p.rotulo} className="flex flex-col items-center gap-1">
          <span className="sgo-type-11 font-semibold tabular-nums text-ink-900">{fmt(p.valor, unidade === 'kg' ? 1 : 0)}</span>
          <div className="flex h-24 w-full items-end rounded-md bg-sunken" title={`${p.rotulo}: ${fmt(p.valor, 3)} ${unidade}${p.nota ? ` · ${p.nota}` : ''}`}>
            <div className={`w-full rounded-md ${p.destaque ? 'bg-brand' : 'bg-brand/45'}`} style={{ height: `${p.valor ? Math.max(4, (p.valor / max) * 100) : 0}%` }} />
          </div>
          <span className="sgo-type-11 text-ink-500">{p.rotulo}</span>
          {p.nota && <span className="sgo-type-11 text-center text-ink-500">{p.nota}</span>}
        </div>
      ))}
    </div>
  );
}

/** Minitendência (linha) para caber numa célula de tabela. */
export function MiniTendencia({ valores, titulo }: { valores: number[]; titulo?: string }) {
  const W = 84, H = 24;
  const comDado = valores.some((v) => v > 0);
  if (!comDado) return <span className="text-xs text-ink-500">—</span>;
  const max = Math.max(...valores), min = Math.min(...valores);
  const amp = max - min || 1;
  const pts = valores.map((v, i) => `${(i / Math.max(valores.length - 1, 1)) * (W - 4) + 2},${H - 3 - ((v - min) / amp) * (H - 6)}`);
  const ultimo = pts[pts.length - 1].split(',');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={titulo ?? 'tendência'}>
      {titulo && <title>{titulo}</title>}
      <polyline points={pts.join(' ')} fill="none" className="text-brand" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={Number(ultimo[0])} cy={Number(ultimo[1])} r={2.5} className="text-brand" fill="currentColor" />
    </svg>
  );
}

/** Barra horizontal atual × anterior (duas faixas finas na mesma escala). */
export function BarraComparada({ atual, anterior, max }: { atual: number; anterior: number; max: number }) {
  const pct = (v: number) => `${max ? Math.min(100, (v / max) * 100) : 0}%`;
  return (
    <div className="space-y-0.5" aria-hidden>
      <div className="h-2 rounded-pill bg-sunken"><div className="h-2 rounded-pill bg-brand" style={{ width: pct(atual) }} /></div>
      <div className="h-1.5 rounded-pill bg-sunken"><div className="h-1.5 rounded-pill bg-ink-400" style={{ width: pct(anterior) }} /></div>
    </div>
  );
}
