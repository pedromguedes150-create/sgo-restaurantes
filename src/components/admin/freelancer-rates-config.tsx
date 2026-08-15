'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Trash2, Plus, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/ds/date-picker';

type DayType = 'WEEKDAY' | 'WEEKEND' | 'HOLIDAY';
const DAY_TYPES: { key: DayType; label: string }[] = [
  { key: 'WEEKDAY', label: 'Dia útil' },
  { key: 'WEEKEND', label: 'Fim de semana' },
  { key: 'HOLIDAY', label: 'Feriado' },
];
interface Unit { id: string; name: string }
interface Holiday { id: string; date: string; name: string }

function fmtBR(iso: string) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }

export function FreelancerRatesConfig({ units, rates, holidays }: {
  units: Unit[]; rates: Record<string, Partial<Record<DayType, number>>>; holidays: Holiday[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<string, Partial<Record<DayType, string>>>>(() => {
    const d: Record<string, Partial<Record<DayType, string>>> = {};
    for (const u of units) { d[u.id] = {}; for (const t of DAY_TYPES) { const v = rates[u.id]?.[t.key]; d[u.id][t.key] = v != null ? String(v) : ''; } }
    return d;
  });
  const [hDate, setHDate] = useState('');
  const [hName, setHName] = useState('');

  async function post(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Falha'); return false; }
      router.refresh(); return true;
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted-foreground">Valor da hora do freelancer</h2>
        <p className="mb-3 text-xs text-muted-foreground">Por unidade e tipo de dia. No pedido, o sistema calcula <b>horas × valor/hora do dia + vale transporte</b> automaticamente.</p>
        <div className="space-y-3">
          {units.map((u) => (
            <div key={u.id} className="rounded-lg border bg-card p-3">
              <p className="mb-2 text-sm font-semibold text-brand">{u.name}</p>
              <div className="grid grid-cols-3 gap-2">
                {DAY_TYPES.map((t) => (
                  <div key={t.key}>
                    <Label className="text-xs">{t.label} (R$/h)</Label>
                    <div className="flex gap-1">
                      <Input inputMode="decimal" value={draft[u.id]?.[t.key] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [u.id]: { ...d[u.id], [t.key]: e.target.value } }))} className="h-9 text-sm" placeholder="0,00" />
                      <Button size="sm" variant="ghost" disabled={busy} aria-label="Salvar"
                        onClick={() => post({ entity: 'freelancerRate', action: 'set', unitId: u.id, dayType: t.key, value: Number((draft[u.id]?.[t.key] ?? '0').replace(',', '.')) })}>
                        <Save className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted-foreground"><CalendarDays className="h-4 w-4" /> Feriados</h2>
        <p className="mb-2 text-xs text-muted-foreground">Datas marcadas como feriado usam o valor/hora de <b>Feriado</b>.</p>
        <div className="mb-2 flex flex-wrap items-end gap-2">
          <DatePicker label="Data" size="sm" value={hDate || null} onValueChange={(v) => setHDate(v ?? '')} />
          <div className="flex-1"><Label className="text-xs">Nome</Label><Input value={hName} onChange={(e) => setHName(e.target.value)} placeholder="ex: Independência" className="h-9 text-sm" /></div>
          <Button size="sm" disabled={busy || !hDate || !hName.trim()} onClick={async () => { if (await post({ entity: 'holiday', action: 'add', date: hDate, name: hName })) { setHDate(''); setHName(''); } }}><Plus className="h-4 w-4" /> Adicionar</Button>
        </div>
        <div className="space-y-1">
          {holidays.length === 0 && <p className="text-xs text-muted-foreground">Nenhum feriado cadastrado.</p>}
          {holidays.map((h) => (
            <div key={h.id} className="flex items-center justify-between rounded-md border bg-card px-3 py-1.5 text-sm">
              <span><b>{fmtBR(h.date)}</b> · {h.name}</span>
              <Button size="sm" variant="ghost" className="text-critical" disabled={busy} onClick={() => post({ entity: 'holiday', action: 'delete', id: h.id })} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
