'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface PStd { id: string; category: string; name: string; description: string | null; photoPath: string | null }

export function ProductStandardsConfig({ items }: { items: PStd[] }) {
  const router = useRouter();
  const [category, setCategory] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    setErr(null);
    if (!category.trim() || !name.trim()) { setErr('Informe categoria e nome.'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('category', category); fd.set('name', name); if (description) fd.set('description', description);
      if (file) fd.set('photo', file);
      const res = await fetch('/api/product-standards', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error ?? 'Falha'); return; }
      setName(''); setDescription(''); setFile(null); router.refresh();
    } finally { setBusy(false); }
  }
  async function del(id: string) {
    if (!confirm('Excluir este produto-padrão?')) return;
    const res = await fetch('/api/product-standards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', id }) });
    if (res.ok) router.refresh();
  }

  const byCat = new Map<string, PStd[]>();
  for (const i of items) { const a = byCat.get(i.category) ?? []; a.push(i); byCat.set(i.category, a); }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Cadastre os produtos que PODEM estar nas vitrines (com foto). No checklist, a IA compara a foto do gerente com este padrão e aponta os itens fora do padrão.</p>
      <div className="rounded-lg border border-dashed p-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-xs">Categoria / vitrine</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="ex: Vitrine de bebidas" className="h-9 text-sm" /></div>
          <div><Label className="text-xs">Produto</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: Refrigerante Coca 350ml" className="h-9 text-sm" /></div>
        </div>
        <div><Label className="text-xs">Descrição (opcional)</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-9 text-sm" /></div>
        <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold text-accent">
          <Camera className="h-4 w-4" /> {file ? file.name.slice(0, 24) : 'Foto de referência'}
          <input type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        {err && <p className="text-sm font-medium text-critical">{err}</p>}
        <Button size="sm" disabled={busy || !category.trim() || !name.trim()} onClick={add}><Plus className="h-4 w-4" /> Adicionar</Button>
      </div>

      {[...byCat.entries()].map(([cat, list]) => (
        <div key={cat}>
          <p className="mb-1 text-sm font-bold text-brand">{cat}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {list.map((p) => (
              <div key={p.id} className="rounded-lg border bg-card p-2">
                {p.photoPath && <img src={`/${p.photoPath}`} alt="" className="mb-1 h-24 w-full rounded object-cover" />}
                <div className="flex items-start justify-between gap-1">
                  <span className="min-w-0"><span className="block truncate text-xs font-semibold">{p.name}</span>{p.description && <span className="block truncate text-[10px] text-muted-foreground">{p.description}</span>}</span>
                  <button onClick={() => del(p.id)} className="text-critical" aria-label="Excluir"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {items.length === 0 && <p className="text-sm text-muted-foreground">Nenhum produto-padrão cadastrado.</p>}
    </div>
  );
}
