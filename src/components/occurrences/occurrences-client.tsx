'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { SearchField } from '@/components/ui/ds/field';
import { Select } from '@/components/ui/ds/select';
import { EmptyState } from '@/components/ui/ds/empty-state';
import { shortUnitName } from '@/lib/unit-name';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { GRAVITY_META, STATUS_META } from '@/lib/occurrences/labels';
import type { OccurrenceGravity, OccurrenceStatus } from '@prisma/client';

export interface OccItem {
  id: string;
  number: number;
  unitName: string;
  unitCode: string;
  typeName: string;
  categoryName: string | null;
  description: string;
  gravity: OccurrenceGravity;
  status: OccurrenceStatus;
  isRecurrence: boolean;
  attachments: number;
  createdAt: string; // ISO
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Lista de ocorrências com busca, filtros na barra superior e unidades recolhidas (16/07). */
export function OccurrencesClient({ items }: { items: OccItem[] }) {
  const [q, setQ] = useState('');
  const [unit, setUnit] = useState('ALL');
  const [gravity, setGravity] = useState<'ALL' | OccurrenceGravity>('ALL');

  const unitNames = useMemo(
    () => [...new Set(items.map((o) => o.unitName))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [items],
  );

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter((o) => {
      if (unit !== 'ALL' && o.unitName !== unit) return false;
      if (gravity !== 'ALL' && o.gravity !== gravity) return false;
      if (!t) return true;
      const num = `${o.unitCode}-${String(o.number).padStart(4, '0')}`.toLowerCase();
      return (
        num.includes(t) ||
        o.typeName.toLowerCase().includes(t) ||
        (o.categoryName ?? '').toLowerCase().includes(t) ||
        (o.description ?? '').toLowerCase().includes(t) ||
        o.unitName.toLowerCase().includes(t)
      );
    });
  }, [items, q, unit, gravity]);

  const groups = useMemo(() => {
    const m = new Map<string, OccItem[]>();
    for (const o of filtered) {
      const arr = m.get(o.unitName) ?? [];
      arr.push(o);
      m.set(o.unitName, arr);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }, [filtered]);


  const card = (o: OccItem) => (
    <Link key={o.id} href={`/modulos/ocorrencias/${o.id}`}>
      <Card className="transition-colors hover:border-brand">
        <CardContent className="flex items-start justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="font-semibold text-ink-900">
              {GRAVITY_META[o.gravity].emoji} #{o.unitCode}-{String(o.number).padStart(4, '0')} · {o.typeName}
            </p>
            <p className="truncate text-sm text-ink-500">{o.categoryName ? `${o.categoryName} — ` : ''}{o.description}</p>
            <p className="mt-0.5 text-xs text-ink-500">
              🕒 {fmtDateTime(o.createdAt)}
              {o.isRecurrence && ' · ♻ reincidência'}
              {o.attachments > 0 && ` · ${o.attachments} anexo(s)`}
            </p>
          </div>
          <StatusBadge tone={STATUS_META[o.status].tone}>{STATUS_META[o.status].label}</StatusBadge>
        </CardContent>
      </Card>
    </Link>
  );

  return (
    <div className="space-y-3">
      {/* Barra superior: busca + filtros */}
      <div className="space-y-2 rounded-card border border-line bg-surface p-3">
        <SearchField
          value={q}
          onValueChange={setQ}
          placeholder="Buscar por nº, tipo, categoria, descrição…"
          label="Busca"
        />
        <div className="flex flex-wrap items-end gap-2">
          {unitNames.length > 1 && (
            <div className="min-w-[10rem] flex-1">
              <Select
                label="Unidade"
                size="sm"
                value={unit}
                onValueChange={setUnit}
                options={[{ value: 'ALL', label: 'Todas as unidades' }, ...unitNames.map((u) => ({ value: u, label: shortUnitName(u) }))]}
              />
            </div>
          )}
          <div className="min-w-[10rem] flex-1">
            <Select
              label="Gravidade"
              size="sm"
              value={gravity}
              onValueChange={(v) => setGravity(v as 'ALL' | OccurrenceGravity)}
              options={[
                { value: 'ALL', label: 'Todas as gravidades' },
                { value: 'LOW', label: 'Baixa' },
                { value: 'MEDIUM', label: 'Média' },
                { value: 'HIGH', label: 'Alta' },
                { value: 'CRITICAL', label: 'Crítica' },
              ]}
            />
          </div>
          <span className="ml-auto pb-2 text-[13px] tabular-nums text-ink-500">{filtered.length} ocorrência(s)</span>
        </div>
      </div>

      {filtered.length === 0 && (
        <EmptyState icon={SlidersHorizontal} title="Nenhuma ocorrência encontrada" description="Limpe a busca ou troque os filtros." />
      )}

      {/* Uma unidade: lista direta. Várias: cada unidade recolhida (fechada por padrão). */}
      {groups.length === 1 && <div className="space-y-2">{groups[0][1].map(card)}</div>}
      {groups.length > 1 && (
        <div className="space-y-2">
          {groups.map(([unitName, list]) => (
            <details key={unitName} className="group rounded-lg border bg-surface">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5">
                <span className="text-sm font-bold uppercase tracking-wide text-ink-500">
                  {unitName} <span className="font-normal">({list.length})</span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-ink-500 transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-2 border-t p-2">{list.map(card)}</div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
