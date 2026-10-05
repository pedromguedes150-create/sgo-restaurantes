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

/**
 * Barras por dia do mês + linha tracejada da média do mês anterior.
 * Dia sem lançamento fica vazio (não é zero de desperdício, é falta de dado) e
 * ganha um traço no pé para não sumir.
 */
export function BarrasDiarias({ pontos, referencia, unidade, rotuloReferencia }: {
  pontos: { date: string; total: number; lancamentos: number }[];
  referencia: number | null;
  unidade: string;
  rotuloReferencia?: string;
}) {
  if (pontos.length === 0) return <p className="text-sm text-ink-500">O mês ainda não começou.</p>;
  const W = 640, H = 180, PAD_B = 22, PAD_T = 14;
  const max = Math.max(1, referencia ?? 0, ...pontos.map((p) => p.total)) * 1.1;
  const passo = W / Math.max(pontos.length, 1);
  const larg = Math.max(2, passo * 0.68);
  const y = (v: number) => PAD_T + (H - PAD_T - PAD_B) * (1 - v / max);
  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Desperdício por dia (${unidade})`}>
        <line x1={0} x2={W} y1={H - PAD_B} y2={H - PAD_B} className="text-line-strong" stroke="currentColor" strokeWidth={1} />
        {pontos.map((p, i) => {
          const x = i * passo + (passo - larg) / 2;
          const dia = Number(p.date.slice(8, 10));
          return (
            <g key={p.date}>
              <title>{`${p.date.slice(8, 10)}/${p.date.slice(5, 7)} — ${p.lancamentos ? `${fmt(p.total, 3)} ${unidade} (${p.lancamentos} lançamento${p.lancamentos > 1 ? 's' : ''})` : 'sem lançamento'}`}</title>
              {p.lancamentos > 0 ? (
                <rect x={x} y={y(p.total)} width={larg} height={Math.max(1, H - PAD_B - y(p.total))} rx={2} className="text-brand" fill="currentColor" />
              ) : (
                <rect x={x} y={H - PAD_B - 2} width={larg} height={2} className="text-line-strong" fill="currentColor" />
              )}
              {(dia === 1 || dia % 5 === 0) && (
                <text x={i * passo + passo / 2} y={H - 6} textAnchor="middle" className="text-ink-500" fill="currentColor" fontSize={11}>{dia}</text>
              )}
            </g>
          );
        })}
        {referencia !== null && referencia > 0 && (
          <g className="text-ink-700">
            <line x1={0} x2={W} y1={y(referencia)} y2={y(referencia)} stroke="currentColor" strokeWidth={1.5} strokeDasharray="5 4" />
            <text x={W - 4} y={y(referencia) - 4} textAnchor="end" fill="currentColor" fontSize={11}>{rotuloReferencia ?? 'média do mês anterior'}</text>
          </g>
        )}
      </svg>
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
