'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Megaphone, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Item {
  id: string; title: string; body: string; priority: string; pinned: boolean; requiresResponse: boolean;
  authorName: string; createdAt: string; attachments: { path: string; name: string; isImage: boolean }[];
}

const PRIO: Record<string, { label: string; cls: string }> = {
  URGENT: { label: 'Urgente', cls: 'bg-danger text-on-brand' },
  IMPORTANT: { label: 'Importante', cls: 'bg-warning-bg text-warning' },
  NORMAL: { label: 'Comunicado', cls: 'bg-sgo-brand text-on-brand' },
};

/**
 * Comunicados em TELA CHEIA ao abrir o app (20/07) — como um anúncio: aparece,
 * o gerente lê e confirma ali mesmo. Um por vez; ao confirmar, passa ao próximo.
 */
export function CommunicationInterstitial() {
  const router = useRouter();
  const [queue, setQueue] = useState<Item[]>([]);
  const [i, setI] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/communications/pending')
      .then((r) => r.json())
      .then((d) => { if (!cancelled && Array.isArray(d.items)) setQueue(d.items); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const cur = queue[i];
  if (!cur) return null;

  async function confirm() {
    setErr(null);
    if (cur.requiresResponse && !note.trim()) { setErr('Este comunicado exige um comentário para confirmar.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/communications/${cur.id}/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responseNote: note.trim() || undefined }),
      });
      if (!res.ok && res.status !== 409) { const d = await res.json().catch(() => ({})); setErr(d.error ?? 'Falha'); return; }
      setNote('');
      if (i + 1 >= queue.length) { setQueue([]); router.refresh(); }
      else setI(i + 1);
    } finally { setBusy(false); }
  }

  const prio = PRIO[cur.priority] ?? PRIO.NORMAL;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-sgo-surface p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${prio.cls}`}>
            <Megaphone className="h-3.5 w-3.5" /> {cur.pinned ? '📌 ' : ''}{prio.label}
          </span>
          <div className="flex items-center gap-2">
            {queue.length > 1 && <span className="text-xs text-ink-500">{i + 1}/{queue.length}</span>}
            <button onClick={() => { if (i + 1 >= queue.length) setQueue([]); else setI(i + 1); }} className="text-ink-500" aria-label="Ver depois"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <h2 className="text-lg font-bold text-sgo-brand">{cur.title}</h2>
        <p className="mb-1 text-xs text-ink-500">Por {cur.authorName} · {new Date(cur.createdAt).toLocaleString('pt-BR')}</p>
        <div className="prose prose-sm mt-2 max-w-none whitespace-pre-wrap text-sm text-ink-900" dangerouslySetInnerHTML={{ __html: cur.body }} />

        {cur.attachments.length > 0 && (
          <div className="mt-3 space-y-2">
            {cur.attachments.map((a, idx) => a.isImage
              ? <a key={idx} href={`/${a.path}`} target="_blank" rel="noreferrer"><img src={`/${a.path}`} alt={a.name} className="max-h-56 rounded-lg border object-contain" /></a>
              : <a key={idx} href={`/${a.path}`} target="_blank" rel="noreferrer" className="block text-sm font-semibold text-sgo-brand underline">📎 {a.name}</a>)}
          </div>
        )}

        {cur.requiresResponse && (
          <div className="mt-3">
            <label className="mb-1 block text-xs font-semibold text-ink-500">Este comunicado exige uma resposta:</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Escreva um comentário para confirmar…" className="w-full rounded-lg border-2 border-line-strong bg-sgo-surface p-2 text-sm" />
          </div>
        )}

        {err && <p className="mt-2 text-sm font-medium text-danger">{err}</p>}

        <div className="mt-4 flex items-center justify-between gap-2">
          <button onClick={() => { if (i + 1 >= queue.length) setQueue([]); else setI(i + 1); }} className="text-xs text-ink-500 underline">ver depois</button>
          <Button onClick={confirm} disabled={busy} size="lg"><Check className="h-5 w-5" /> {busy ? 'Confirmando…' : 'Li e confirmo'}</Button>
        </div>
      </div>
    </div>
  );
}
