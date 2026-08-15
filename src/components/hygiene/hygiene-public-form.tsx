'use client';

import { useState } from 'react';
import { Check, Star } from 'lucide-react';

const ISSUES = ['Papel/insumos', 'Lixo cheio', 'Piso/cheiro', 'Vaso/pia', 'Outro'];

export function HygienePublicForm({ unitId, locations, preselect }: { unitId: string; locations: { id: string; name: string }[]; preselect: string | null }) {
  const [locationId, setLocationId] = useState<string | null>(preselect && locations.some((l) => l.id === preselect) ? preselect : (locations.length === 1 ? locations[0].id : null));
  const [issue, setIssue] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (locations.length > 0 && !locationId) { setErr('Selecione o banheiro.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/higiene', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unitId, locationId, issue, rating: rating || null, comment: comment || null }) });
      if (res.ok) setDone(true); else { const d = await res.json().catch(() => ({})); setErr(d.error ?? 'Falha ao enviar'); }
    } catch { setErr('Falha de conexão'); } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="rounded-2xl bg-surface p-6 text-center">
        <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-success/15"><Check className="h-8 w-8 text-success" /></div>
        <p className="text-lg font-bold text-brand">Obrigado! 🙏</p>
        <p className="text-sm text-ink-500">A equipe de manutenção foi avisada. Vamos cuidar disso.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl bg-surface p-4">
      {locations.length > 0 && (
        <div>
          <p className="mb-1.5 text-sm font-semibold text-brand">Qual banheiro?</p>
          <div className="flex flex-wrap gap-2">
            {locations.map((l) => (
              <button key={l.id} onClick={() => setLocationId(l.id)} className={`rounded-full border px-3 py-2 text-sm font-semibold ${locationId === l.id ? 'bg-brand text-on-brand border-brand' : ''}`}>{l.name}</button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-sm font-semibold text-brand">O que está faltando? <span className="font-normal text-ink-500">(opcional)</span></p>
        <div className="flex flex-wrap gap-2">
          {ISSUES.map((it) => (
            <button key={it} onClick={() => setIssue(issue === it ? null : it)} className={`rounded-full border px-3 py-2 text-sm ${issue === it ? 'bg-brand text-on-brand border-brand' : ''}`}>{it}</button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-semibold text-brand">Como você avalia este banheiro? <span className="font-normal text-ink-500">(opcional)</span></p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setRating(rating === n ? 0 : n)} aria-label={`${n} estrelas`}>
              <Star className={`h-8 w-8 ${n <= rating ? 'fill-warning text-warning' : 'text-ink-400'}`} />
            </button>
          ))}
        </div>
      </div>

      <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Comentário (opcional)" className="w-full rounded-lg border-2 border-line-strong bg-surface p-2 text-sm" />

      {err && <p className="text-sm font-medium text-danger">{err}</p>}
      <button onClick={submit} disabled={busy} className="w-full rounded-xl bg-brand py-3 text-base font-bold text-on-brand disabled:opacity-60">{busy ? 'Enviando…' : 'Avisar a equipe'}</button>
    </div>
  );
}
