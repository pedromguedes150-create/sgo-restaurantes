'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { postAdmin } from '@/lib/admin-client';

export interface CmdConfigRow { id: string; name: string; rangeStart: number | null; rangeEnd: number | null }

export function CommandsConfigAdmin({ units }: { units: CmdConfigRow[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Defina a faixa de numeração das comandas de cada unidade (ex.: de 1 a 200). É a base para a contagem diária e as divergências.</p>
      {units.map((u) => <UnitRow key={u.id} unit={u} />)}
      {units.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma unidade.</p>}
    </div>
  );
}

function UnitRow({ unit }: { unit: CmdConfigRow }) {
  const router = useRouter();
  const [start, setStart] = useState(unit.rangeStart != null ? String(unit.rangeStart) : '');
  const [end, setEnd] = useState(unit.rangeEnd != null ? String(unit.rangeEnd) : '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const configured = unit.rangeStart != null && unit.rangeEnd != null;

  async function save() {
    if (!start || !end) { setMsg('Informe início e fim.'); return; }
    setBusy(true); setMsg(null);
    const r = await postAdmin({ entity: 'commandConfig', action: 'set', unitId: unit.id, rangeStart: Number(start), rangeEnd: Number(end) });
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    setMsg('Salvo.'); router.refresh();
  }

  const total = start && end && Number(end) >= Number(start) ? Number(end) - Number(start) + 1 : null;

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-brand">{unit.name}</p>
        <span className={configured ? 'text-xs font-medium text-success' : 'text-xs font-medium text-critical'}>{configured ? 'Configurada' : 'Não configurada'}</span>
      </div>
      <div className="mt-2 flex items-end gap-2">
        <div><Label className="text-xs">Início</Label><Input inputMode="numeric" value={start} onChange={(e) => setStart(e.target.value)} className="h-10 w-24 text-sm" placeholder="1" /></div>
        <div><Label className="text-xs">Fim</Label><Input inputMode="numeric" value={end} onChange={(e) => setEnd(e.target.value)} className="h-10 w-24 text-sm" placeholder="200" /></div>
        <Button size="sm" disabled={busy} onClick={save}><Save className="h-4 w-4" /> Salvar</Button>
        {total != null && <span className="pb-2 text-xs text-muted-foreground">{total} comandas</span>}
      </div>
      {msg && <p className="mt-1 text-xs font-medium text-muted-foreground">{msg}</p>}
    </div>
  );
}
