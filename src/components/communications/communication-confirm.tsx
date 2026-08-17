'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

/** Form de confirmação de leitura do comunicado (resposta opcional ou obrigatória). */
export function CommunicationConfirm({ id, requiresResponse }: { id: string; requiresResponse: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function confirm() {
    setErr(null);
    if (requiresResponse && !note.trim() && !file) { setErr('Este comunicado exige uma resposta (foto ou comentário).'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      if (note.trim()) fd.set('responseNote', note.trim());
      if (file) fd.set('responsePhoto', file);
      const res = await fetch(`/api/communications/${id}/confirm`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error ?? 'Falha'); return; }
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-2 rounded-lg border-2 border-brand/40 bg-brand/5 p-3">
      <p className="text-sm font-semibold text-ink-900">Confirme que leu este comunicado</p>
      <div>
        <Label className="text-xs">Resposta {requiresResponse ? '(obrigatória)' : '(opcional)'}</Label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-lg border-2 border-line-strong bg-surface px-3 py-2 text-sm" placeholder="Comentário (ex.: feito, segue foto)" />
      </div>
      <div>
        <Label className="text-xs">Foto {requiresResponse ? '(prova de execução)' : '(opcional)'}</Label>
        <input type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
      </div>
      {err && <p className="text-sm font-medium text-danger">{err}</p>}
      <Button onClick={confirm} disabled={busy} size="lg" className="w-full"><CheckCircle2 className="h-5 w-5" /> Confirmar leitura</Button>
    </div>
  );
}
