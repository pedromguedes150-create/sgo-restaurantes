'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Upload, Download, Trash2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/ds/select';

interface Prod { id: string; name: string; origin: string; category: string; measure: string; active: boolean }
const MEASURES = ['un', 'kg', 'cx', 'pct', 'L', 'dz'];
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function ProductCatalogAdmin({ products }: { products: Prod[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [name, setName] = useState(''); const [origin, setOrigin] = useState('FABRICA'); const [category, setCategory] = useState(''); const [measure, setMeasure] = useState('un');

  async function post(body: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) router.refresh(); else { const d = await res.json().catch(() => ({})); setMsg(d.error ?? 'Falha'); }
    } finally { setBusy(false); }
  }
  async function importFile(file: File) {
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData(); fd.set('file', file);
      const res = await fetch('/api/products/import', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { setMsg(`Importado: ${d.created} novo(s), ${d.updated} atualizado(s).`); router.refresh(); } else setMsg(d.error ?? 'Falha na importação');
    } finally { setBusy(false); }
  }

  const filtered = useMemo(() => { const t = norm(q.trim()); return products.filter((p) => !t || norm(p.name).includes(t) || norm(p.category).includes(t)); }, [products, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Importar Excel</Button>
        <a href="/api/products/export" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-accent"><Download className="h-4 w-4" /> Exportar Excel</a>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
        <span className="text-xs text-muted-foreground">Colunas: Nome, Origem (Fábrica/CD), Categoria, Medida</span>
      </div>
      {msg && <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm font-medium text-accent">{msg}</p>}

      {/* Novo produto */}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
        <div className="flex-1 min-w-[8rem]"><label className="text-xs">Nome</label><Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" /></div>
        <div className="w-32"><Select label="Origem" size="sm" value={origin} onValueChange={setOrigin} options={[{ value: 'FABRICA', label: 'Fábrica' }, { value: 'CD', label: 'CD' }]} /></div>
        <div><label className="text-xs">Categoria</label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Geral" className="h-9 w-28 text-sm" /></div>
        <div className="w-24"><Select label="Medida" size="sm" value={measure} onValueChange={setMeasure} options={MEASURES.map((m) => ({ value: m, label: m }))} /></div>
        <Button size="sm" disabled={busy || !name.trim()} onClick={async () => { await post({ action: 'catUpsert', name: name.trim(), origin, category: category.trim() || 'Geral', measure }); setName(''); setCategory(''); }}><Plus className="h-4 w-4" /></Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="buscar no catálogo…" className="h-10 w-full rounded-lg border-2 border-input bg-background pl-9 pr-3 text-sm" />
      </div>

      <p className="text-xs text-muted-foreground">{filtered.length} de {products.length} produto(s)</p>
      <div className="space-y-1.5">
        {filtered.map((p) => (
          <div key={p.id} className={`flex items-center justify-between gap-2 rounded-lg border p-2 ${p.active ? 'bg-card' : 'bg-surface opacity-60'}`}>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-brand">{p.name}</p>
              <p className="text-[11px] text-muted-foreground">{p.origin === 'CD' ? 'CD' : 'Fábrica'} · {p.category} · {p.measure}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button onClick={() => post({ action: 'catToggle', id: p.id, active: !p.active })} disabled={busy} className="text-xs text-accent underline">{p.active ? 'desativar' : 'ativar'}</button>
              <button onClick={() => { if (confirm(`Excluir "${p.name}"?`)) post({ action: 'catDelete', id: p.id }); }} disabled={busy} className="text-critical"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
