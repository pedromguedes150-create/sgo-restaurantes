'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { postAdmin } from '@/lib/admin-client';
import { Group } from '@/components/ui/ds/group';

export interface SupChecklistUI { id: string; name: string; items: string[]; active: boolean }

export function SupervisorChecklistsAdmin({ checklists }: { checklists: SupChecklistUI[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<SupChecklistUI | null>(null);
  const [creating, setCreating] = useState(false);

  async function run(payload: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    const r = await postAdmin(payload);
    setBusy(false);
    if (r.ok) { router.refresh(); return true; }
    alert(r.error ?? 'Falha');
    return false;
  }

  return (
    <div className="space-y-3">
      {!creating && !editing && (
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Novo checklist de supervisor</Button>
      )}

      {(creating || editing) && (
        <ChecklistForm
          init={editing ?? undefined}
          busy={busy}
          onCancel={() => { setCreating(false); setEditing(null); }}
          onSave={async (name, items) => {
            const ok = editing
              ? await run({ entity: 'supervisorChecklist', action: 'update', id: editing.id, name, items })
              : await run({ entity: 'supervisorChecklist', action: 'create', name, items });
            if (ok) { setCreating(false); setEditing(null); }
          }}
        />
      )}

      {/* Estado vazio FORA do grupo: dentro, viraria uma linha de lista sem
          respiro, e a caixa desenharia moldura em volta de uma frase. */}
      {checklists.length === 0 && <p className="text-sm text-ink-500">Nenhum checklist criado. Eles são usados pelo supervisor na visita às unidades.</p>}
      <Group>
        {checklists.map((c) => (
          <div key={c.id} className="p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-ink-900">{c.name}</p>
              <span className="flex items-center gap-1.5">
                <StatusBadge tone={c.active ? 'success' : 'neutral'}>{c.active ? 'Ativo' : 'Inativo'}</StatusBadge>
                <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setEditing(c); }} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ entity: 'supervisorChecklist', action: 'toggle', id: c.id, active: !c.active })}>{c.active ? 'Inativar' : 'Ativar'}</Button>
                <Button size="sm" variant="ghost" className="text-danger" disabled={busy} onClick={() => { if (confirm(`Excluir "${c.name}"? (com histórico de visitas, só inativa)`)) void run({ entity: 'supervisorChecklist', action: 'delete', id: c.id }); }} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>
              </span>
            </div>
            <ul className="mt-1 list-inside list-disc text-sm text-ink-500">
              {c.items.map((i) => <li key={i}>{i}</li>)}
            </ul>
          </div>
        ))}
      </Group>
    </div>
  );
}

function ChecklistForm({ init, busy, onSave, onCancel }: {
  init?: SupChecklistUI; busy: boolean;
  onSave: (name: string, items: string[]) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(init?.name ?? '');
  const [items, setItems] = useState<string[]>(init?.items?.length ? init.items : ['']);

  return (
    <div className="rounded-lg border border-dashed p-3">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">{init ? 'Editar checklist' : 'Novo checklist'}</p>
      <div className="space-y-2">
        <div><Label className="text-xs">Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Visita padrão — salão e cozinha" className="h-10 text-sm" /></div>
        <Label className="text-xs">Itens verificados na visita</Label>
        {items.map((it, i) => (
          <div key={i} className="flex gap-1.5">
            <Input value={it} onChange={(e) => setItems((s) => s.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Item ${i + 1} — ex.: Uniformes completos`} className="h-10 text-sm" />
            <Button size="sm" variant="ghost" className="text-danger" onClick={() => setItems((s) => s.filter((_, j) => j !== i))} disabled={items.length === 1} aria-label="Remover item"><X className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => setItems((s) => [...s, ''])}><Plus className="h-4 w-4" /> Adicionar item</Button>
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button size="sm" disabled={busy || !name.trim() || items.every((i) => !i.trim())} onClick={() => onSave(name.trim(), items.map((i) => i.trim()).filter(Boolean))}><Save className="h-4 w-4" /> Salvar</Button>
        </div>
      </div>
    </div>
  );
}
