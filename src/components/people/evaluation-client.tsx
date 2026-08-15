'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Star, MessageSquarePlus, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { postAdmin } from '@/lib/admin-client';
import { cn } from '@/lib/utils';
import { Select } from '@/components/ui/ds/select';
import { shortUnitName } from '@/lib/unit-name';

export interface EvalRow {
  collaboratorId: string; name: string; jobTitle: string | null; unitId: string; unitName: string; observationCount: number;
  evaluation: { punctuality: number; performance: number; teamwork: number; presentation: number; comments: string | null; evaluatorName: string; updatedAt: string } | null;
}
interface Obs { id: string; text: string; authorName: string; createdAt: string }
interface Hist { yearMonth: string; punctuality: number; performance: number; teamwork: number; presentation: number; comments: string | null; evaluatorName: string }

const CRITERIA: { key: 'punctuality' | 'performance' | 'teamwork' | 'presentation'; label: string }[] = [
  { key: 'punctuality', label: 'Pontualidade' },
  { key: 'performance', label: 'Desempenho' },
  { key: 'teamwork', label: 'Trabalho em equipe' },
  { key: 'presentation', label: 'Apresentação/higiene' },
];
const avg = (e: { punctuality: number; performance: number; teamwork: number; presentation: number }) =>
  Math.round(((e.punctuality + e.performance + e.teamwork + e.presentation) / 4) * 10) / 10;
const fmtMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};

export function EvaluationClient({ rows, yearMonth, months, canEvaluate, isAdmin, weight }: {
  rows: EvalRow[]; yearMonth: string; months: string[]; canEvaluate: boolean; isAdmin: boolean; weight: number;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<'PENDING' | 'ALL'>('PENDING');
  const [unitFilter, setUnitFilter] = useState('ALL');
  const [busy, setBusy] = useState(false);
  const [w, setW] = useState(String(weight));

  const unitOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) if (r.unitId) map.set(r.unitId, r.unitName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [rows]);
  const inUnit = useMemo(() => rows.filter((r) => unitFilter === 'ALL' || r.unitId === unitFilter), [rows, unitFilter]);
  const shown = useMemo(() => inUnit.filter((r) => filter === 'ALL' || !r.evaluation), [inUnit, filter]);
  const done = inUnit.filter((r) => r.evaluation).length;

  async function saveWeight() {
    setBusy(true);
    const r = await postAdmin({ entity: 'evaluation', action: 'setWeight', weight: Number(w) });
    setBusy(false);
    if (r.ok) router.refresh(); else alert(r.error ?? 'Falha');
  }

  return (
    <div className="space-y-3">
      {isAdmin && (
        <div className="flex items-end gap-2 rounded-lg border border-dashed p-2">
          <div>
            <label className="text-xs text-ink-500">Peso das Avaliações na meta (0 = não conta)</label>
            <Input inputMode="numeric" value={w} onChange={(e) => setW(e.target.value)} className="h-9 w-24 text-sm" />
          </div>
          <Button size="sm" variant="outline" disabled={busy} onClick={saveWeight}>Salvar peso</Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-56">
          <Select
            aria-label="Mês" size="sm" className="capitalize" value={yearMonth}
            onValueChange={(v) => router.push(`/modulos/pessoas/avaliacao?mes=${v}`)}
            options={months.map((m) => ({ value: m, label: fmtMonth(m) }))}
          />
        </div>
        {unitOptions.length > 1 && (
          <div className="w-56">
            <Select
              aria-label="Filtrar por unidade" size="sm" value={unitFilter} onValueChange={setUnitFilter}
              options={[{ value: 'ALL', label: 'Todas as unidades' }, ...unitOptions.map(([id, name]) => ({ value: id, label: shortUnitName(name) }))]}
            />
          </div>
        )}
        {(['PENDING', 'ALL'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={filter === f ? 'rounded-full bg-sgo-brand px-3 py-1.5 text-sm font-semibold text-on-brand' : 'rounded-full border px-3 py-1.5 text-sm'}>
            {f === 'PENDING' ? 'A avaliar' : 'Todos'}
          </button>
        ))}
        <span className="ml-auto text-xs text-ink-500">{done}/{inUnit.length} avaliado(s)</span>
      </div>

      {shown.length === 0 && (
        <p className="text-sm text-ink-500">{filter === 'PENDING' ? 'Todos os colaboradores do mês já foram avaliados. 🎉' : 'Nenhum colaborador no seu escopo.'}</p>
      )}
      <div className="space-y-2">
        {shown.map((r) => <EvalCard key={r.collaboratorId} r={r} yearMonth={yearMonth} canEvaluate={canEvaluate} />)}
      </div>
    </div>
  );
}

function Stars({ value, onChange, disabled }: { value: number; onChange?: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n} type="button" disabled={disabled || !onChange}
          onClick={() => onChange?.(n)}
          className={cn('rounded p-0.5', onChange && !disabled ? 'cursor-pointer' : 'cursor-default')}
          aria-label={`${n} de 5`}
        >
          <Star className={cn('h-5 w-5', n <= value ? 'fill-sgo-brand text-sgo-brand' : 'text-ink-400')} />
        </button>
      ))}
    </div>
  );
}

function EvalCard({ r, yearMonth, canEvaluate }: { r: EvalRow; yearMonth: string; canEvaluate: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'AVALIAR' | 'OBS' | 'HIST'>('AVALIAR');
  const [busy, setBusy] = useState(false);
  const [scores, setScores] = useState({
    punctuality: r.evaluation?.punctuality ?? 0,
    performance: r.evaluation?.performance ?? 0,
    teamwork: r.evaluation?.teamwork ?? 0,
    presentation: r.evaluation?.presentation ?? 0,
  });
  const [comments, setComments] = useState(r.evaluation?.comments ?? '');
  const [obs, setObs] = useState<Obs[] | null>(null);
  const [newObs, setNewObs] = useState('');
  const [hist, setHist] = useState<Hist[] | null>(null);

  useEffect(() => {
    setScores({
      punctuality: r.evaluation?.punctuality ?? 0,
      performance: r.evaluation?.performance ?? 0,
      teamwork: r.evaluation?.teamwork ?? 0,
      presentation: r.evaluation?.presentation ?? 0,
    });
    setComments(r.evaluation?.comments ?? '');
  }, [r.evaluation]);

  async function loadObs() {
    const res = await fetch(`/api/people/evaluation?collaboratorId=${r.collaboratorId}`);
    if (res.ok) setObs((await res.json()).observations);
  }
  async function loadHist() {
    const res = await fetch(`/api/people/evaluation?collaboratorId=${r.collaboratorId}&view=history`);
    if (res.ok) setHist((await res.json()).history);
  }

  async function saveEval() {
    if (CRITERIA.some((c) => scores[c.key] < 1)) { alert('Dê uma nota de 1 a 5 em todos os critérios.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/people/evaluation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'evaluate', collaboratorId: r.collaboratorId, yearMonth, ...scores, comments }),
      });
      if (res.ok) router.refresh();
      else { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Falha'); }
    } finally { setBusy(false); }
  }

  async function addObs() {
    const t = newObs.trim();
    if (!t) return;
    setBusy(true);
    try {
      const res = await fetch('/api/people/evaluation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'observe', collaboratorId: r.collaboratorId, text: t }),
      });
      if (res.ok) { setNewObs(''); await loadObs(); router.refresh(); }
      else { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Falha'); }
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-lg border bg-sgo-surface">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-2 p-3 text-left">
        <span className="flex min-w-0 items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <span className="min-w-0">
            <span className="block truncate font-semibold text-sgo-brand">{r.name}</span>
            <span className="block truncate text-xs text-ink-500">{r.jobTitle || 'Sem função'} · {r.unitName}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {r.observationCount > 0 && <span className="text-xs text-ink-500">{r.observationCount} obs.</span>}
          {r.evaluation
            ? <StatusBadge tone="success">Avaliado · {avg(r.evaluation).toLocaleString('pt-BR')}★</StatusBadge>
            : <StatusBadge tone="medium">A avaliar</StatusBadge>}
        </span>
      </button>

      {open && (
        <div className="border-t p-3">
          <div className="mb-3 flex gap-1.5">
            {([['AVALIAR', 'Avaliação'], ['OBS', 'Observações'], ['HIST', 'Histórico']] as const).map(([t, label]) => (
              <button
                key={t}
                onClick={() => { setTab(t); if (t === 'OBS' && obs === null) void loadObs(); if (t === 'HIST' && hist === null) void loadHist(); }}
                className={tab === t ? 'rounded-full bg-sgo-brand px-3 py-1 text-xs font-semibold text-on-brand' : 'rounded-full border px-3 py-1 text-xs'}
              >
                {t === 'OBS' ? <span className="flex items-center gap-1"><MessageSquarePlus className="h-3.5 w-3.5" />{label}</span>
                  : t === 'HIST' ? <span className="flex items-center gap-1"><History className="h-3.5 w-3.5" />{label}</span>
                  : label}
              </button>
            ))}
          </div>

          {tab === 'AVALIAR' && (
            <div className="space-y-2">
              {CRITERIA.map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-2">
                  <span className="text-sm">{c.label}</span>
                  <Stars value={scores[c.key]} onChange={canEvaluate ? (v) => setScores((s) => ({ ...s, [c.key]: v })) : undefined} disabled={busy} />
                </div>
              ))}
              <Input value={comments} onChange={(e) => setComments(e.target.value)} placeholder="Comentário do mês (opcional)" className="text-sm" disabled={!canEvaluate} />
              {r.evaluation && (
                <p className="text-xs text-ink-500">Avaliado por {r.evaluation.evaluatorName} em {new Date(r.evaluation.updatedAt).toLocaleDateString('pt-BR')}.</p>
              )}
              {canEvaluate && (
                <Button size="sm" variant="gold" disabled={busy} onClick={saveEval}>{r.evaluation ? 'Atualizar avaliação' : 'Salvar avaliação'}</Button>
              )}
            </div>
          )}

          {tab === 'OBS' && (
            <div className="space-y-2">
              {canEvaluate && (
                <div className="flex gap-1.5">
                  <Input value={newObs} onChange={(e) => setNewObs(e.target.value)} placeholder="Nova observação (ex.: chegou atrasado, ajudou no salão…)" className="text-sm" />
                  <Button size="sm" variant="outline" disabled={busy || !newObs.trim()} onClick={addObs}>Anotar</Button>
                </div>
              )}
              {obs === null && <p className="text-xs text-ink-500">Carregando…</p>}
              {obs?.length === 0 && <p className="text-sm text-ink-500">Nenhuma observação registrada.</p>}
              {obs?.map((o) => (
                <div key={o.id} className="rounded-md bg-canvas p-2">
                  <p className="text-sm">{o.text}</p>
                  <p className="mt-0.5 text-xs text-ink-500">{o.authorName} · {new Date(o.createdAt).toLocaleDateString('pt-BR')}</p>
                </div>
              ))}
            </div>
          )}

          {tab === 'HIST' && (
            <div className="space-y-1.5">
              {hist === null && <p className="text-xs text-ink-500">Carregando…</p>}
              {hist?.length === 0 && <p className="text-sm text-ink-500">Sem avaliações anteriores.</p>}
              {hist?.map((h) => (
                <div key={h.yearMonth} className="flex items-center justify-between gap-2 rounded-md bg-canvas p-2 text-sm">
                  <span className="capitalize">{fmtMonth(h.yearMonth)}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-ink-500">{h.evaluatorName}</span>
                    <span className="font-semibold tabular-nums">{avg(h).toLocaleString('pt-BR')}★</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
