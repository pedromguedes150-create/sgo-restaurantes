'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './button';
import { DatePicker } from './date-picker';
import { SegmentedControl } from './segmented-control';
import { toISO, addDays, todayISO } from '@/lib/ds/date';

/**
 * Período por ATALHO (Onda 4). Dois campos de data para responder "e este mês?"
 * é trabalho à toa — e `<input type="date">` é proibido (regra 6). Aqui os
 * casos comuns viram um toque; o intervalo exato continua disponível em
 * "Escolher datas", com os DatePickers do design system.
 */
type Preset = 'mes' | 'mesPassado' | 'proximos30' | 'custom';

function monthRange(offset = 0): { start: string; end: string } {
  const n = new Date();
  const y = n.getFullYear();
  const m = n.getMonth() + 1 + offset;
  const y2 = y + Math.floor((m - 1) / 12);
  const m2 = ((((m - 1) % 12) + 12) % 12) + 1;
  const last = new Date(Date.UTC(y2, m2, 0)).getUTCDate();
  return { start: toISO(y2, m2, 1), end: toISO(y2, m2, last) };
}

export function PeriodPicker({ start, end, basePath }: { start: string; end: string; basePath: string }) {
  const router = useRouter();
  const thisMonth = monthRange(0);
  const lastMonth = monthRange(-1);
  const next30 = { start: todayISO(), end: addDays(todayISO(), 30) };

  const current: Preset =
    start === thisMonth.start && end === thisMonth.end ? 'mes'
    : start === lastMonth.start && end === lastMonth.end ? 'mesPassado'
    : start === next30.start && end === next30.end ? 'proximos30'
    : 'custom';

  const [preset, setPreset] = useState<Preset>(current);
  const [from, setFrom] = useState<string | null>(start);
  const [to, setTo] = useState<string | null>(end);

  const go = (s: string, e: string) => router.push(`${basePath}?start=${s}&end=${e}`);

  return (
    <div className="space-y-3">
      <SegmentedControl
        aria-label="Período"
        size="sm"
        value={preset}
        onValueChange={(v) => {
          setPreset(v);
          if (v === 'mes') go(thisMonth.start, thisMonth.end);
          else if (v === 'mesPassado') go(lastMonth.start, lastMonth.end);
          else if (v === 'proximos30') go(next30.start, next30.end);
        }}
        options={[
          { value: 'mes', label: 'Este mês' },
          { value: 'mesPassado', label: 'Mês passado' },
          { value: 'proximos30', label: 'Próximos 30 dias' },
          { value: 'custom', label: 'Escolher datas' },
        ]}
      />

      {preset === 'custom' && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-40"><DatePicker label="De" value={from} onValueChange={setFrom} /></div>
          <div className="w-40"><DatePicker label="Até" value={to} onValueChange={setTo} min={from ?? undefined} /></div>
          <Button size="md" disabled={!from || !to} onClick={() => { if (from && to) go(from, to); }}>Aplicar</Button>
        </div>
      )}
    </div>
  );
}
