'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { Banner } from '@/components/ui/ds/banner';

/**
 * Editor de data de lançamento (Notas/Pagamentos/Gás/Óleo) — substitui o antigo
 * prompt() de "AAAA-MM-DD". Onda 6: usa o DatePicker do design system (o
 * calendário nativo saiu, regra 6), com `max=hoje` bloqueando data futura.
 * Envia AAAA-MM-DD para /api/entry-date, mantendo a regra de negócio
 * (desconto de % na meta do gerente).
 */
export function InlineDateEdit({ module, id, current, onClose }: {
  module: 'payment' | 'note' | 'gas' | 'oil';
  id: string;
  current: string; // AAAA-MM-DD
  onClose: () => void;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [val, setVal] = useState<string | null>((current || today).slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!val) { setErr('Escolha uma data.'); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/entry-date', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ module, id, date: val }) });
      if (res.ok) { onClose(); router.refresh(); }
      else { const d = await res.json().catch(() => ({})); setErr(d.error ?? 'Falha ao salvar a data.'); }
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-2 rounded-card border border-line bg-sgo-surface p-3 print:hidden">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-44">
          <DatePicker
            label="Data correta do lançamento"
            max={today}
            value={val}
            onValueChange={(d) => { setVal(d); setErr(null); }}
            hint="A edição desconta % na meta do gerente."
          />
        </div>
        <Button size="sm" loading={busy} onClick={() => void submit()}><Save className="h-4 w-4" /> Salvar</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}><X className="h-4 w-4" /> Cancelar</Button>
      </div>
      {err && <Banner tone="danger" title={err} className="mt-2" />}
    </div>
  );
}
