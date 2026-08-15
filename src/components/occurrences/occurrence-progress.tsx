'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Tags } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/ds/select';

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
      <div className="rounded-lg border bg-surface p-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">Andamento ({updates.length})</p>
        {updates.length === 0 && <p className="text-sm text-ink-500">Nenhuma fase registrada ainda.</p>}
        <ol className="space-y-2 border-l-2 border-brand/30 pl-3">
          {updates.map((u) => (
            <li key={u.id}>
              <p className="text-sm">{u.text}</p>
              <p className="text-xs text-ink-500">{u.authorName} · {new Date(u.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
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
          <button onClick={() => setReclass(!reclass)} className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-500">
            <Tags className="h-3.5 w-3.5" /> Reclassificar (tipo atual: {currentType})
          </button>
          {reclass && (
            <div className="mt-2 space-y-2">
              <Select
                label="Novo tipo" size="sm" placeholder="Selecione…" value={typeId}
                onValueChange={(v) => { setTypeId(v); setCategoryId(''); }}
                options={types.map((t) => ({ value: t.id, label: t.name }))}
              />
              {type && type.categories.length > 0 && (
                <Select
                  label="Categoria" size="sm" value={categoryId} onValueChange={setCategoryId}
                  options={[{ value: '', label: '— sem categoria —' }, ...type.categories.map((c) => ({ value: c.id, label: c.name }))]}
                />
              )}
              <p className="text-xs text-ink-500">Tipos marcados como Manutenção/TI movem a ocorrência para a sub-aba correspondente.</p>
              <Button size="sm" disabled={busy || !typeId} onClick={() => void post({ action: 'reclassify', typeId, categoryId: categoryId || undefined })}>Aplicar</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
