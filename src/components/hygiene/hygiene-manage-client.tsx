'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Plus, Trash2, QrCode, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';

interface Req { id: string; locationName: string; issue: string | null; rating: number | null; comment: string | null; status: string; resolvedByName: string | null; createdAt: string; resolvedAt: string | null }
interface Loc { id: string; name: string; active: boolean }

export function HygieneManageClient({ unitId, canManage, requests, locations }: { unitId: string; canManage: boolean; requests: Req[]; locations: Loc[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [newLoc, setNewLoc] = useState('');
  const [copied, setCopied] = useState(false);

  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/higiene/${unitId}` : `/higiene/${unitId}`;

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch('/api/higiene/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) router.refresh(); else { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Falha'); }
    } finally { setBusy(false); }
  }

  const open = requests.filter((r) => r.status !== 'RESOLVED');
  const resolved = requests.filter((r) => r.status === 'RESOLVED');

  return (
    <div className="space-y-4">
      {/* QR / link público */}
      {canManage && (
        <Card><CardContent className="pt-4">
          <p className="mb-1 flex items-center gap-1 text-sm font-bold text-ink-900"><QrCode className="h-4 w-4" /> Link do QR do banheiro (desta unidade)</p>
          <p className="mb-2 text-xs text-ink-500">Gere o QR Code apontando para este endereço e cole no banheiro. Sem login — o cliente só toca e envia.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg border bg-canvas px-2 py-1.5 text-xs">{publicUrl}</code>
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}><Copy className="h-4 w-4" /> {copied ? 'Copiado' : 'Copiar'}</Button>
          </div>
        </CardContent></Card>
      )}

      {/* Locais (banheiros) */}
      {canManage && (
        <Card><CardContent className="pt-4">
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-500">Banheiros cadastrados</p>
          <div className="mb-2 flex flex-wrap gap-2">
            {locations.length === 0 && <span className="text-sm text-ink-500">Nenhum — cadastre abaixo (ex.: Masculino, Feminino, PCD).</span>}
            {locations.map((l) => (
              <span key={l.id} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${l.active ? 'font-semibold' : 'text-ink-500 line-through'}`}>
                {l.name}
                <button onClick={() => post({ action: 'locToggle', id: l.id, active: !l.active })} disabled={busy} className="text-xs text-brand underline">{l.active ? 'desativar' : 'ativar'}</button>
                <button onClick={() => { if (confirm(`Excluir "${l.name}"?`)) post({ action: 'locDelete', id: l.id }); }} disabled={busy} className="text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
              </span>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <Input value={newLoc} onChange={(e) => setNewLoc(e.target.value)} placeholder="ex.: Banheiro Masculino" className="h-9 max-w-xs text-sm" />
            <Button size="sm" disabled={busy || !newLoc.trim()} onClick={async () => { await post({ action: 'locUpsert', unitId, name: newLoc.trim() }); setNewLoc(''); }}><Plus className="h-4 w-4" /> Adicionar</Button>
          </div>
        </CardContent></Card>
      )}

      {/* Solicitações */}
      <div>
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-500">Em aberto ({open.length})</p>
        {open.length === 0 && <p className="text-sm text-success">Nenhuma solicitação em aberto 🎉</p>}
        <div className="space-y-2">
          {open.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-2 rounded-lg border border-danger/30 bg-danger/5 p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-900">🚻 {r.locationName}{r.issue ? ` · ${r.issue}` : ''}</p>
                <p className="text-xs text-ink-500">{new Date(r.createdAt).toLocaleString('pt-BR')}{r.rating ? ` · ${r.rating}★` : ''}{r.comment ? ` · "${r.comment}"` : ''}</p>
              </div>
              <Button size="sm" disabled={busy} onClick={() => post({ action: 'resolve', id: r.id })}><Check className="h-4 w-4" /> Resolver</Button>
            </div>
          ))}
        </div>
      </div>

      {resolved.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-brand">Resolvidas ({resolved.length})</summary>
          <div className="mt-2 space-y-1.5">
            {resolved.map((r) => (
              <div key={r.id} className="rounded-lg border bg-surface p-2.5 text-xs">
                <span className="font-semibold text-ink-900">{r.locationName}</span>{r.issue ? ` · ${r.issue}` : ''} · <span className="text-ink-500">{new Date(r.createdAt).toLocaleString('pt-BR')}</span>
                {r.resolvedByName && <span className="text-success"> · resolvido por {r.resolvedByName}</span>}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
