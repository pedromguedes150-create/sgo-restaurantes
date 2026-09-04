'use client';

import { useState } from 'react';
import { DoorOpen, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

type Coverage = 'ok' | 'partial' | 'none';
/** Efetivo e freelancer moram na MESMA célula — a planta conta o que está aqui. */
interface Pessoa { id: string; name: string; source: string; kind?: 'STAFF' | 'FREELANCER'; pendente?: boolean; horario?: string | null }

interface Grid {
  sectors: { id: string; name: string; minHeadcount: number }[];
  shifts: { id: string | null; label: string }[];
  cells: Record<string, Record<string, Pessoa[]>>;
  coverage: Record<string, Record<string, Coverage>>;
}

// Cores da "sala" por cobertura (combinam com o tema bordô/grafite)
const ROOM: Record<Coverage, { floor: string; wall: string; dot: string; label: string }> = {
  ok:      { floor: 'bg-success/15', wall: 'shadow-[6px_6px_0_0_rgba(22,163,74,0.45)]', dot: 'bg-success', label: 'Coberto' },
  partial: { floor: 'bg-warning/20',  wall: 'shadow-[6px_6px_0_0_rgba(202,138,4,0.45)]', dot: 'bg-warning',  label: 'Parcial' },
  none:    { floor: 'bg-danger/10', wall: 'shadow-[6px_6px_0_0_rgba(185,28,28,0.4)]', dot: 'bg-danger', label: 'Sem cobertura' },
};

/**
 * Planta VISUAL (teste) da unidade: cada setor vira uma "área/sala" em estilo 3D,
 * colorida pela cobertura. Layout automático em grade — quando houver a planta
 * real da unidade, dá para posicionar cada área nas coordenadas corretas.
 */
export function UnitFloorplan({ grid }: { grid: Grid }) {
  const [tilt, setTilt] = useState(false);

  // Agrega por setor: pessoas distintas e cobertura geral
  const rooms = grid.sectors.map((s) => {
    const people = new Map<string, string>();
    let anyNone = false, allOk = true;
    for (const col of grid.shifts) {
      for (const p of grid.cells[s.id]?.[col.label] ?? []) people.set(p.id, p.name);
      const cov = grid.coverage[s.id]?.[col.label] ?? 'none';
      if (cov === 'none') anyNone = true;
      if (cov !== 'ok') allOk = false;
    }
    const count = people.size;
    const coverage: Coverage = count === 0 ? 'none' : anyNone ? 'partial' : allOk ? 'ok' : 'partial';
    return { ...s, count, coverage, names: [...people.values()] };
  });

  if (rooms.length === 0) {
    return <p className="text-sm text-ink-500">Cadastre setores para ver a planta da unidade.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-3 text-xs">
          {(['ok', 'partial', 'none'] as Coverage[]).map((c) => (
            <span key={c} className="inline-flex items-center gap-1"><span className={cn('h-2.5 w-2.5 rounded-full', ROOM[c].dot)} /> {ROOM[c].label}</span>
          ))}
        </div>
        <button onClick={() => setTilt((v) => !v)} className="rounded-full border px-3 py-1 text-xs font-medium hover:border-brand">
          {tilt ? 'Ver de cima' : 'Visão 3D'}
        </button>
      </div>

      {/* "Terreno" da unidade (blueprint) */}
      <div className="overflow-x-auto rounded-xl border-2 border-brand/20 bg-[linear-gradient(0deg,rgba(110,20,35,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(110,20,35,0.04)_1px,transparent_1px)] bg-[size:22px_22px] p-4">
        <div
          className="origin-top transition-transform duration-300"
          style={tilt ? { transform: 'perspective(1400px) rotateX(20deg)', transformStyle: 'preserve-3d' } : undefined}
        >
          <div className="mb-3 flex items-center gap-1 text-xs font-semibold text-ink-900">
            <DoorOpen className="h-4 w-4" /> Entrada
          </div>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {rooms.map((r) => (
              <div
                key={r.id}
                className={cn('rounded-lg border-2 border-brand/30 p-2.5', ROOM[r.coverage].floor, ROOM[r.coverage].wall)}
              >
                <div className="flex items-start justify-between gap-1">
                  <p className="text-sm font-bold leading-tight text-ink-900">{r.name}</p>
                  <span className={cn('mt-0.5 h-3 w-3 shrink-0 rounded-full', ROOM[r.coverage].dot)} title={ROOM[r.coverage].label} />
                </div>
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-ink-500">
                  <Users className="h-3.5 w-3.5" /> {r.count}{r.minHeadcount ? `/${r.minHeadcount}` : ''} pessoa(s)
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {r.names.slice(0, 6).map((n, i) => (
                    <span key={i} className="truncate rounded bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-ink-900">{n.split(' ')[0]}</span>
                  ))}
                  {r.names.length > 6 && <span className="text-[10px] text-ink-500">+{r.names.length - 6}</span>}
                  {r.count === 0 && <span className="text-[10px] font-semibold text-danger">vazio</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="text-center text-[11px] text-ink-500">Planta automática (teste). Envie a planta da unidade para posicionarmos cada área no lugar real.</p>
    </div>
  );
}
