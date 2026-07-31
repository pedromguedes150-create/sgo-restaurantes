'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Editor de data de lançamento (Notas/Pagamentos/Gás/Óleo) — substitui o antigo
 * prompt() de "AAAA-MM-DD". Calendário nativo: dá para CLICAR ou DIGITAR; em
 * navegador pt-BR exibe DD/MM/AAAA. `max=hoje` bloqueia data futura (e datas
 * impossíveis não são aceitas pelo controle). Envia AAAA-MM-DD para /api/entry-date,
 * mantendo a regra de negócio (desconto de % na meta do gerente).
 */
export function InlineDateEdit({ module, id, current, onClose }: {
  module: 'payment' | 'note' | 'gas' | 'oil';
  id: string;
  current: string; // AAAA-MM-DD
  onClose: () => void;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [val, setVal] = useState((current || today).slice(0, 10));
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
    <div className="mt-2 rounded-lg border-2 border-accent/40 bg-card p-3 print:hidden">
      <Label className="text-xs">Data correta do lançamento</Label>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Input type="date" max={today} value={val} onChange={(e) => { setVal(e.target.value); setErr(null); }} className="h-9 w-44 text-sm" />
        <Button size="sm" disabled={busy} onClick={() => void submit()}><Save className="h-4 w-4" /> Salvar</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}><X className="h-4 w-4" /> Cancelar</Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Clique no calendário ou digite (DD/MM/AAAA). A edição desconta % na meta do gerente.</p>
      {err && <p className="mt-1 text-xs font-medium text-critical">{err}</p>}
    </div>
  );
}
