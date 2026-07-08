'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { postAdmin } from '@/lib/admin-client';

/** Admin ajusta o % descontado da meta por lançamento com data editada (item 4, 07/07). */
export function LateEntryConfig({ current }: { current: number }) {
  const router = useRouter();
  const [v, setV] = useState(String(current).replace('.', ','));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const r = await postAdmin({ entity: 'lateEntry', action: 'setPenalty', pct: Number(v.replace(',', '.')) });
    setBusy(false);
    if (r.ok) router.refresh(); else alert(r.error ?? 'Falha');
  }
  return (
    <div className="flex items-end gap-2 rounded-lg border border-dashed p-2 print:hidden">
      <div>
        <label className="text-xs text-muted-foreground">Desconto por lançamento fora do prazo (% na meta)</label>
        <Input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} className="h-9 w-24 text-sm" />
      </div>
      <Button size="sm" variant="outline" disabled={busy} onClick={save}>Salvar</Button>
      <p className="pb-1 text-xs text-muted-foreground">Aplicado quando Admin/Supervisor corrige a data de Pagamentos, Notas, Gás ou Óleo.</p>
    </div>
  );
}
