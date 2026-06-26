'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatBRL } from '@/lib/utils';

interface Reason { id: string; name: string }
interface Unit { id: string; name: string }
interface Item { id: string; unit: string; coupon: string; operator: string | null; value: number }

export function CancellationsClient({
  isAdmin,
  units,
  reasons,
  pending,
}: {
  isAdmin: boolean;
  units: Unit[];
  reasons: Reason[];
  pending: Item[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; m: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // estado de justificativa por item
  const [sel, setSel] = useState<Record<string, { reasonId: string; note: string }>>({});

  async function justify(id: string) {
    const s = sel[id];
    if (!s?.reasonId) {
      setMsg({ t: 'err', m: 'Selecione o motivo.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/cancellations/${id}/justify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setMsg({ t: 'err', m: data.error ?? 'Falha' });
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const selectClass = 'h-11 w-full rounded-lg border-2 border-input bg-background px-3 text-sm';

  return (
    <div className="space-y-5">
      {isAdmin && <ImportForm units={units} onDone={() => router.refresh()} />}

      <div className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Pendentes de justificativa ({pending.length})
        </h2>
        {pending.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma pendência. 🟢</p>}
        {msg && <p className={msg.t === 'ok' ? 'text-sm text-success' : 'text-sm text-critical'}>{msg.m}</p>}

        {pending.map((c) => (
          <div key={c.id} className="rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-brand">Cupom {c.coupon}</p>
              <span className="font-bold text-critical">{formatBRL(c.value)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {c.unit}
              {c.operator && ` · operador ${c.operator}`}
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <select
                className={selectClass}
                value={sel[c.id]?.reasonId ?? ''}
                onChange={(e) => setSel((s) => ({ ...s, [c.id]: { reasonId: e.target.value, note: s[c.id]?.note ?? '' } }))}
              >
                <option value="">Motivo…</option>
                {reasons.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <Input
                placeholder="observação (opcional)"
                value={sel[c.id]?.note ?? ''}
                onChange={(e) => setSel((s) => ({ ...s, [c.id]: { reasonId: s[c.id]?.reasonId ?? '', note: e.target.value } }))}
                className="h-11"
              />
              <Button size="sm" disabled={busy} onClick={() => justify(c.id)} className="shrink-0">
                <Check className="h-4 w-4" /> Justificar
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ImportForm({ units, onDone }: { units: Unit[]; onDone: () => void }) {
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    if (!file) { setMsg('Selecione o arquivo (Excel ou CSV) do Teknisa.'); return; }
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append('unitId', unitId);
      fd.append('file', file);
      const res = await fetch('/api/cancellations/import', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      setMsg(res.ok ? `Importados ${data.created} cancelamento(s).` : (data.error ?? 'Falha na importação'));
      if (res.ok) { setFile(null); onDone(); }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed p-3">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">Importar Teknisa (Excel/CSV) — Admin</h2>
      <div className="space-y-2">
        <div>
          <Label htmlFor="iu">Unidade</Label>
          <select id="iu" className="mt-1 h-11 w-full rounded-lg border-2 border-input bg-background px-3 text-sm" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <input type="file" accept=".xlsx,.xls,.csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
        <p className="text-[11px] text-muted-foreground">Relatório Relação de Cupons SAT/NFC-e (Teknisa). Traz nº do cupom e valor; linhas de total são ignoradas.</p>
        <Button onClick={submit} disabled={busy} className="w-full"><Upload className="h-4 w-4" /> Importar</Button>
        {msg && <p className="text-sm font-medium text-muted-foreground">{msg}</p>}
      </div>
    </div>
  );
}
