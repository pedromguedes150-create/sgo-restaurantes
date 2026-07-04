'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Config da tolerância de tempo dos checklists (Admin). Concluir até `limite +
 * tolerância` ainda conta "no prazo" (DONE). Padrão 10 min.
 */
export function ChecklistToleranceConfig({ current }: { current: number }) {
  const router = useRouter();
  const [value, setValue] = useState(String(current));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity: 'checklistTolerance', action: 'set', minutes: Number(value) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(data.error ?? 'Falha'); return; }
      setMsg('Salvo!'); router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-lg border border-dashed p-3">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted-foreground"><Clock className="h-4 w-4" /> Tolerância de tempo</h2>
      <p className="mb-2 text-xs text-muted-foreground">Concluir um checklist até <b>{value || 0} min</b> após o horário-limite ainda conta <b>no prazo</b>. Vale para todos os checklists.</p>
      <div className="flex items-end gap-2">
        <div>
          <label className="block text-xs font-medium text-muted-foreground">Minutos</label>
          <Input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))} className="h-10 w-24 text-sm" />
        </div>
        <Button size="sm" disabled={busy} onClick={save}><Save className="h-4 w-4" /> Salvar</Button>
        {msg && <span className={`text-sm ${msg === 'Salvo!' ? 'text-success' : 'text-critical'}`}>{msg}</span>}
      </div>
    </div>
  );
}
