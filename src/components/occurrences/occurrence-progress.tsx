'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Tags } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface UpdateRow { id: string; text: string; authorName: string; createdAt: string }
export interface TypeOpt { id: string; name: string; categories: { id: string; name: string }[] }

/** Fases do andamento (timeline + registrar) e reclassificação (16/07). */
export function OccurrenceProgress({ occurrenceId, updates, closed, types, currentType }: {
  occurrenceId: string; updates: UpdateRow[]; closed: boolean; types: TypeOpt[]; currentType: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [reclass, setReclass] = useState(false);
  const [typeId, setTypeId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const type = types.find((t) => t.id === typeId);

  async function post(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(`/api/occurrences/${occurrenceId}/update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { router.refresh(); return true; }
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? 'Falha');
      return false;
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      {/* Timeline do andamento */}
      <div className="rounded-lg border bg-card p-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Andamento ({updates.length})</p>
        {updates.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma fase registrada ainda.</p>}
        <ol className="space-y-2 border-l-2 border-accent/30 pl-3">
          {updates.map((u) => (
            <li key={u.id}>
              <p className="text-sm">{u.text}</p>
              <p className="text-xs text-muted-foreground">{u.authorName} · {new Date(u.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
            </li>
          ))}
        </ol>
        {!closed && (
          <div className="mt-2 flex gap-1.5">
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Registrar andamento (ex.: técnico acionado, peça pedida…)" className="h-10 flex-1 text-sm" />
            <Button size="sm" disabled={busy || !text.trim()} onClick={async () => { if (await post({ action: 'addUpdate', text })) setText(''); }}><Plus className="h-4 w-4" /> Registrar</Button>
          </div>
        )}
      </div>

      {/* Reclassificar (move para Manutenção/TI conforme o tipo) */}
      {!closed && (
        <div className="rounded-lg border border-dashed p-3">
          <button onClick={() => setReclass(!reclass)} className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <Tags className="h-3.5 w-3.5" /> Reclassificar (tipo atual: {currentType})
          </button>
          {reclass && (
            <div className="mt-2 space-y-2">
              <div>
                <Label className="text-xs">Novo tipo</Label>
                <select className="h-10 w-full rounded-lg border-2 border-input bg-background px-3 text-sm" value={typeId} onChange={(e) => { setTypeId(e.target.value); setCategoryId(''); }}>
                  <option value="">Selecione…</option>
                  {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              {type && type.categories.length > 0 && (
                <div>
                  <Label className="text-xs">Categoria</Label>
                  <select className="h-10 w-full rounded-lg border-2 border-input bg-background px-3 text-sm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                    <option value="">—</option>
                    {type.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}
              <p className="text-xs text-muted-foreground">Tipos marcados como Manutenção/TI movem a ocorrência para a sub-aba correspondente.</p>
              <Button size="sm" disabled={busy || !typeId} onClick={() => void post({ action: 'reclassify', typeId, categoryId: categoryId || undefined })}>Aplicar</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
