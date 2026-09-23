'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronUp, ArrowLeft, BarChart3 } from 'lucide-react';
import { StatCard } from '@/components/ui/ds/stat-card';
import { shortUnitName } from '@/lib/unit-name';
import type { MetaRankingRow } from '@/lib/metas/query';
import type { ConsolidadoStats, PiorMeta, EvolucaoMes, ComparacaoUnidade } from '@/lib/metas/consolidado';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  ranking: MetaRankingRow[];
  stats: ConsolidadoStats;
  pioresMetas: PiorMeta[];
  month: string; // YYYY-MM
  monthLabel: string;
  unidadesDisponiveis: { id: string; name: string }[];
}

type ZoneKey = 'success' | 'warning' | 'danger';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function zone(pct: number): ZoneKey {
  return pct >= 80 ? 'success' : pct >= 50 ? 'warning' : 'danger';
}

const ZONE_BAR: Record<ZoneKey, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

const ZONE_TEXT: Record<ZoneKey, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

const ZONE_BG: Record<ZoneKey, string> = {
  success: 'bg-success-bg',
  warning: 'bg-warning-bg',
  danger: 'bg-danger-bg',
};

function ScoreBadge({ pct }: { pct: number }) {
  const z = zone(pct);
  return (
    <span className={`inline-block min-w-10 rounded-pill px-2 py-0.5 text-center text-xs font-bold tabular-nums ${ZONE_BG[z]} ${ZONE_TEXT[z]}`}>
      {pct}%
    </span>
  );
}

// ─── Horizontal bar for one unit ──────────────────────────────────────────────

function UnitBar({ row, month, onClick }: { row: MetaRankingRow; month: string; onClick: () => void }) {
  const z = zone(row.scorePct);
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-sunken"
      aria-label={`Ver detalhe de ${shortUnitName(row.name)}`}
    >
      <span className="w-28 shrink-0 truncate text-sm text-ink-700 group-hover:text-ink-900">{shortUnitName(row.name)}</span>
      <div className="min-w-0 flex-1">
        <div className="relative h-5 overflow-hidden rounded-pill bg-sunken">
          <div
            className={`absolute inset-y-0 left-0 rounded-pill transition-all ${ZONE_BAR[z]}`}
            style={{ width: `${row.scorePct}%` }}
          />
        </div>
      </div>
      <ScoreBadge pct={row.scorePct} />
    </button>
  );
}

// ─── Status distribution boxes ────────────────────────────────────────────────

function StatusDist({ stats, total, onFilter }: { stats: ConsolidadoStats; total: number; onFilter: (z: ZoneKey | null) => void }) {
  return (
    <div className="space-y-2">
      {(
        [
          { key: 'success' as ZoneKey, label: 'Na meta', count: stats.dentroDaMeta, icon: CheckCircle2 },
          { key: 'warning' as ZoneKey, label: 'Atenção', count: stats.atencao, icon: AlertTriangle },
          { key: 'danger' as ZoneKey, label: 'Críticas', count: stats.criticas, icon: XCircle },
        ] as const
      ).map(({ key, label, count, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onFilter(count > 0 ? key : null)}
          disabled={count === 0}
          className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
            count > 0 ? 'cursor-pointer hover:bg-sunken' : 'cursor-default opacity-50'
          } border-line bg-surface`}
        >
          <Icon className={`h-4 w-4 shrink-0 ${ZONE_TEXT[key]}`} aria-hidden />
          <span className="flex-1 text-sm text-ink-700">{label}</span>
          <span className={`text-base font-bold tabular-nums ${ZONE_TEXT[key]}`}>{count}</span>
          <span className="text-xs text-ink-500">
            {total > 0 ? Math.round((count / total) * 100) : 0}%
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── Evolution chart (SVG line) ────────────────────────────────────────────────

function EvolucaoChart({ data }: { data: EvolucaoMes[] }) {
  if (data.length < 2) return <p className="text-sm text-ink-500">Dados insuficientes para o gráfico.</p>;

  const W = 600;
  const H = 160;
  const PAD = { t: 24, b: 32, l: 32, r: 16 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;

  const values = data.map((d) => d.scorePct);
  const minV = Math.max(0, Math.min(...values) - 10);
  const maxV = Math.min(100, Math.max(...values) + 10);
  const range = maxV - minV || 1;

  const xOf = (i: number) => PAD.l + (i / (data.length - 1)) * cW;
  const yOf = (v: number) => PAD.t + cH - ((v - minV) / range) * cH;

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${yOf(d.scorePct)}`).join(' ');

  const yTicks = [minV, (minV + maxV) / 2, maxV].map(Math.round);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" style={{ height: 160 }}>
      {/* Grid lines */}
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={PAD.l} y1={yOf(v)} x2={W - PAD.r} y2={yOf(v)} stroke="var(--sgo-line)" strokeWidth={0.5} />
          <text x={PAD.l - 4} y={yOf(v) + 4} textAnchor="end" fontSize={9} fill="var(--sgo-ink-500)">
            {v}%
          </text>
        </g>
      ))}
      {/* 80% reference line */}
      {maxV >= 80 && minV <= 80 && (
        <line x1={PAD.l} y1={yOf(80)} x2={W - PAD.r} y2={yOf(80)} stroke="var(--sgo-success)" strokeWidth={1} strokeDasharray="4,3" opacity={0.5} />
      )}
      {/* Month labels */}
      {data.map((d, i) => (
        <text key={d.month} x={xOf(i)} y={H - PAD.b + 14} textAnchor="middle" fontSize={9} fill="var(--sgo-ink-500)">
          {d.monthLabel}
        </text>
      ))}
      {/* Line */}
      <path d={linePath} fill="none" stroke="var(--sgo-brand)" strokeWidth={2} strokeLinejoin="round" />
      {/* Points */}
      {data.map((d, i) => (
        <g key={d.month}>
          <circle cx={xOf(i)} cy={yOf(d.scorePct)} r={4} fill="var(--sgo-brand)" stroke="var(--sgo-surface)" strokeWidth={1.5} />
          <text x={xOf(i)} y={yOf(d.scorePct) - 8} textAnchor="middle" fontSize={9} fill="var(--sgo-ink-700)">
            {d.scorePct}%
          </text>
        </g>
      ))}
    </svg>
  );
}

// ─── 5 Piores metas ───────────────────────────────────────────────────────────

function PiorMetaRow({ item, maxPct }: { item: PiorMeta; maxPct: number }) {
  const [open, setOpen] = useState(false);
  const z = zone(item.scorePct);

  return (
    <div className="rounded-lg border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-900">{item.name}</p>
          <div className="mt-1.5 h-3 overflow-hidden rounded-pill bg-sunken">
            <div
              className={`h-3 rounded-pill ${ZONE_BAR[z]}`}
              style={{ width: `${(item.scorePct / maxPct) * 100}%` }}
            />
          </div>
        </div>
        <ScoreBadge pct={item.scorePct} />
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-ink-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-ink-400" />}
      </button>

      {open && (
        <div className="border-t border-line px-3 pb-3 pt-2">
          <p className="mb-2 text-xs font-semibold text-ink-500">Por unidade</p>
          <div className="space-y-1.5">
            {item.unidades.map((u) => {
              const uz = zone(u.scorePct);
              return (
                <div key={u.unitId} className="flex items-center gap-2">
                  <span className="w-24 shrink-0 truncate text-xs text-ink-700">{u.name}</span>
                  <div className="min-w-0 flex-1">
                    <div className="h-2 overflow-hidden rounded-pill bg-sunken">
                      <div className={`h-2 rounded-pill ${ZONE_BAR[uz]}`} style={{ width: `${u.scorePct}%` }} />
                    </div>
                  </div>
                  <span className={`w-9 text-right text-xs font-bold tabular-nums ${ZONE_TEXT[uz]}`}>{u.scorePct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Comparison tool ──────────────────────────────────────────────────────────

function ComparacaoTool({
  unidadesDisponiveis,
  month,
}: {
  unidadesDisponiveis: { id: string; name: string }[];
  month: string;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [data, setData] = useState<ComparacaoUnidade[] | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 3 ? [...prev, id] : prev));
    setData(null);
  };

  const comparar = useCallback(async () => {
    if (selected.length < 2) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/metas/consolidado?action=comparacao&unitIds=${selected.join(',')}&month=${month}`);
      const json: ComparacaoUnidade[] = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [selected, month]);

  // Unique task names across all selected units
  const taskNames = data ? [...new Set(data.flatMap((u) => u.breakdown.map((b) => b.name)))] : [];

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-500">Selecione de 2 a 3 unidades para comparar lado a lado.</p>
      <div className="flex flex-wrap gap-2">
        {unidadesDisponiveis.map((u) => {
          const sel = selected.includes(u.id);
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => toggle(u.id)}
              disabled={!sel && selected.length >= 3}
              className={`rounded-pill border px-3 py-1 text-sm transition-colors ${
                sel ? 'border-brand bg-brand text-white' : 'border-line bg-surface text-ink-700 hover:bg-sunken disabled:opacity-40'
              }`}
            >
              {shortUnitName(u.name)}
            </button>
          );
        })}
      </div>

      {selected.length >= 2 && !data && (
        <button
          type="button"
          onClick={comparar}
          disabled={loading}
          className="rounded-control bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-60"
        >
          {loading ? 'Carregando…' : 'Comparar unidades'}
        </button>
      )}

      {data && data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="pb-2 text-left font-semibold text-ink-700">Componente</th>
                {data.map((u) => (
                  <th key={u.unitId} className="pb-2 text-center font-semibold text-ink-700">
                    <div>{u.name}</div>
                    <ScoreBadge pct={u.scorePct} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {taskNames.map((name) => (
                <tr key={name} className="border-b border-line/50">
                  <td className="py-1.5 pr-4 text-ink-500">{name}</td>
                  {data.map((u) => {
                    const row = u.breakdown.find((b) => b.name === name);
                    return (
                      <td key={u.unitId} className="py-1.5 text-center">
                        {row ? <ScoreBadge pct={row.scorePct} /> : <span className="text-ink-400">–</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function ConsolidadoRedeClient({ ranking, stats, pioresMetas, month, monthLabel, unidadesDisponiveis }: Props) {
  const [filtroZone, setFiltroZone] = useState<ZoneKey | null>(null);
  const [evolucao, setEvolucao] = useState<EvolucaoMes[] | null>(null);
  const [evolMeses, setEvolMeses] = useState<3 | 6 | 12>(6);
  const [evolLoading, setEvolLoading] = useState(false);
  const [comparacaoAberta, setComparacaoAberta] = useState(false);
  const [drillUnit, setDrillUnit] = useState<MetaRankingRow | null>(null);

  const carregarEvolucao = useCallback(
    async (meses: 3 | 6 | 12) => {
      setEvolLoading(true);
      try {
        const res = await fetch(`/api/metas/consolidado?action=evolucao&meses=${meses}&month=${month}`);
        const data: EvolucaoMes[] = await res.json();
        setEvolucao(data);
      } finally {
        setEvolLoading(false);
      }
    },
    [month],
  );

  useEffect(() => {
    carregarEvolucao(evolMeses);
  }, [carregarEvolucao, evolMeses]);

  const rankingFiltrado = filtroZone ? ranking.filter((r) => zone(r.scorePct) === filtroZone) : ranking;
  const maxPior = pioresMetas.length > 0 ? Math.max(...pioresMetas.map((p) => p.scorePct)) : 100;

  // ── Drill-down: unidade selecionada ──────────────────────────────────────────
  if (drillUnit) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setDrillUnit(null)}
          className="flex items-center gap-2 text-sm font-medium text-brand hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Voltar à rede
        </button>

        <div className="rounded-card border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink-900">{shortUnitName(drillUnit.name)}</h2>
            <ScoreBadge pct={drillUnit.scorePct} />
          </div>
          <p className="mt-1 text-sm text-ink-500">Mês: {monthLabel}</p>
          <p className="mt-3 text-sm text-ink-500">
            Para ver o detalhamento completo desta unidade, acesse{' '}
            <a href={`/modulos/metas?unit=${drillUnit.unitId}&month=${month}`} className="font-medium text-brand hover:underline">
              Metas → {shortUnitName(drillUnit.name)}
            </a>
            .
          </p>
        </div>

        <div className="rounded-card border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink-900">Posição no ranking da rede</h3>
          <div className="space-y-1">
            {ranking.map((r, i) => (
              <div key={r.unitId} className={`flex items-center gap-2 rounded px-2 py-1 ${r.unitId === drillUnit.unitId ? 'bg-brand-tint' : ''}`}>
                <span className="w-5 text-center text-xs font-bold tabular-nums text-ink-500">{i + 1}</span>
                <span className="flex-1 text-sm text-ink-700">{shortUnitName(r.name)}</span>
                <ScoreBadge pct={r.scorePct} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Main dashboard ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Performance média"
          value={`${stats.media}%`}
          tone={stats.media >= 80 ? 'success' : stats.media >= 50 ? 'warning' : 'danger'}
          icon={BarChart3}
        />
        <StatCard
          label="Melhor unidade"
          value={`${stats.melhor}%`}
          tone="success"
          icon={TrendingUp}
        />
        <StatCard
          label="Na meta"
          value={stats.dentroDaMeta}
          hint={`de ${ranking.length} unidades`}
          tone={stats.dentroDaMeta === ranking.length ? 'success' : 'default'}
          icon={CheckCircle2}
        />
        <StatCard
          label="Atenção"
          value={stats.atencao}
          hint="50–79%"
          tone={stats.atencao > 0 ? 'warning' : 'default'}
          icon={AlertTriangle}
        />
        <StatCard
          label="Críticas"
          value={stats.criticas}
          hint="abaixo de 50%"
          tone={stats.criticas > 0 ? 'danger' : 'default'}
          icon={TrendingDown}
        />
      </div>

      {/* Performance por unidade + Status */}
      <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
        {/* Horizontal bars */}
        <div className="rounded-card border border-line bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-900">Performance por unidade</h2>
            {filtroZone && (
              <button type="button" onClick={() => setFiltroZone(null)} className="text-xs text-brand hover:underline">
                Limpar filtro
              </button>
            )}
          </div>
          <div className="space-y-1">
            {rankingFiltrado.length === 0 && <p className="text-sm text-ink-500">Nenhuma unidade nesta faixa.</p>}
            {rankingFiltrado.map((r) => (
              <UnitBar key={r.unitId} row={r} month={month} onClick={() => setDrillUnit(r)} />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-ink-400">Clique em uma unidade para ver detalhes.</p>
        </div>

        {/* Status distribution */}
        <div className="rounded-card border border-line bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink-900">Status das metas</h2>
          <StatusDist stats={stats} total={ranking.length} onFilter={setFiltroZone} />
          <p className="mt-3 text-[11px] text-ink-400">Clique para filtrar o gráfico ao lado.</p>
        </div>
      </div>

      {/* Evolução + 5 piores */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Evolution chart */}
        <div className="rounded-card border border-line bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-900">Evolução da rede</h2>
            <div className="flex gap-1">
              {([3, 6, 12] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setEvolMeses(m)}
                  className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                    evolMeses === m ? 'bg-brand text-white' : 'bg-sunken text-ink-500 hover:bg-sunken'
                  }`}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>
          {evolLoading && <div className="flex h-40 items-center justify-center text-sm text-ink-500">Carregando…</div>}
          {!evolLoading && evolucao && <EvolucaoChart data={evolucao} />}
          <p className="mt-1 text-[11px] text-ink-400">Média da rede por mês. Tracejado verde = meta (80%).</p>
        </div>

        {/* 5 worst tasks */}
        <div className="rounded-card border border-line bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink-900">5 metas com pior desempenho</h2>
          {pioresMetas.length === 0 ? (
            <p className="text-sm text-ink-500">Sem dados para este mês.</p>
          ) : (
            <div className="space-y-2">
              {pioresMetas.map((m) => (
                <PiorMetaRow key={m.name} item={m} maxPct={maxPior} />
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] text-ink-400">Clique em uma meta para ver o desempenho por unidade.</p>
        </div>
      </div>

      {/* Ranking completo */}
      <div className="rounded-card border border-line bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">Ranking completo — {monthLabel}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className="w-8 pb-2 text-center text-xs font-semibold text-ink-500">#</th>
                <th className="pb-2 text-left text-xs font-semibold text-ink-500">Unidade</th>
                <th className="pb-2 text-right text-xs font-semibold text-ink-500">Performance</th>
                <th className="w-36 pb-2 text-ink-500"></th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r, i) => (
                <tr key={r.unitId} className="border-b border-line/50">
                  <td className="py-2 text-center text-xs font-bold tabular-nums text-ink-400">{i + 1}</td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => setDrillUnit(r)}
                      className="text-sm text-ink-700 hover:text-brand hover:underline"
                    >
                      {shortUnitName(r.name)}
                    </button>
                  </td>
                  <td className="py-2 text-right">
                    <ScoreBadge pct={r.scorePct} />
                  </td>
                  <td className="py-2 pl-3">
                    <div className="h-2 overflow-hidden rounded-pill bg-sunken">
                      <div className={`h-2 rounded-pill ${ZONE_BAR[zone(r.scorePct)]}`} style={{ width: `${r.scorePct}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Comparison tool */}
      <div className="rounded-card border border-line bg-surface">
        <button
          type="button"
          onClick={() => setComparacaoAberta((o) => !o)}
          className="flex w-full items-center justify-between px-4 py-3 text-left"
          aria-expanded={comparacaoAberta}
        >
          <span className="text-sm font-semibold text-ink-900">Comparação entre unidades</span>
          {comparacaoAberta ? (
            <ChevronUp className="h-4 w-4 text-ink-400" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4 text-ink-400" aria-hidden />
          )}
        </button>
        {comparacaoAberta && (
          <div className="border-t border-line px-4 pb-4 pt-3">
            <ComparacaoTool unidadesDisponiveis={unidadesDisponiveis} month={month} />
          </div>
        )}
      </div>
    </div>
  );
}
