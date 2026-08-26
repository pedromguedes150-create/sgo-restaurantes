'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Upload, Download, Trash2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/ds/select';

interface Prod {
  id: string; name: string; origin: string; category: string; measure: string; active: boolean;
  /** Quantidade por embalagem (a coluna QUANT das listas de fornecedor). */
  packSize?: number | null;
  barcode?: string | null;
}
const MEASURES = ['un', 'kg', 'cx', 'pct', 'L', 'dz'];
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function ProductCatalogAdmin({ products }: { products: Prod[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [name, setName] = useState(''); const [origin, setOrigin] = useState('FABRICA'); const [category, setCategory] = useState(''); const [measure, setMeasure] = useState('un');
  const [pack, setPack] = useState(''); const [barcode, setBarcode] = useState('');
  /* Origem da IMPORTAÇÃO, separada da origem do cadastro manual: uma planilha
     inteira costuma ser de um lado só, e misturar as duas confundiria. */
  const [importOrigin, setImportOrigin] = useState('FABRICA');

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
      const fd = new FormData();
      fd.set('file', file);
      /* A lista do fornecedor não diz Fábrica ou CD — vai a escolha da tela. */
      fd.set('origin', importOrigin);
      const res = await fetch('/api/products/import', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(d.error ?? 'Falha na importação'); return; }
      /* O resultado CONTA o que aconteceu: qual categoria veio do cabeçalho e
         que origem foi aplicada. Antes dizia só "0 criados" e a pessoa ficava
         sem saber se o arquivo estava errado ou se o sistema não entendeu. */
      const partes = [`${d.created} novo(s)`, `${d.updated} atualizado(s)`];
      if (d.ignored > 0) partes.push(`${d.ignored} linha(s) sem nome, ignorada(s)`);
      const extra = [
        d.categoryFromHeader ? `categoria "${d.categoryFromHeader}" (do cabeçalho)` : null,
        d.hadOriginColumn ? 'origem lida da planilha' : `origem: ${importOrigin === 'CD' ? 'CD' : 'Fábrica'}`,
      ].filter(Boolean).join(' · ');
      setMsg(`Importado: ${partes.join(', ')}. ${extra}`);
      router.refresh();
    } finally { setBusy(false); }
  }

  const filtered = useMemo(() => {
    const t = norm(q.trim());
    /* Busca por código de barras também: com 214 bebidas, achar pelo nome exato
       é mais lento do que bipar a garrafa. */
    return products.filter((p) => !t || norm(p.name).includes(t) || norm(p.category).includes(t) || (p.barcode ?? '').includes(t));
  }, [products, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* A origem vem ANTES do botão: é escolha, não detalhe — e depois de
            escolher o arquivo o navegador já dispara a importação. */}
        <div className="w-40"><Select label="Origem da planilha" size="sm" value={importOrigin} onValueChange={setImportOrigin} options={[{ value: 'FABRICA', label: 'Fábrica' }, { value: 'CD', label: 'CD' }]} /></div>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Importar Excel</Button>
        <a href="/api/products/export" className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-brand"><Download className="h-4 w-4" /> Exportar Excel (modelo)</a>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
      </div>
      <p className="text-xs text-ink-500">
        A planilha pode ser a <b>lista do fornecedor</b>: nomes na primeira coluna e, se o cabeçalho dela for o nome da
        categoria (ex.: <b>BEBIDAS</b>), a categoria vem de lá. Também são lidas as colunas <b>QUANT</b> (por embalagem),
        <b> UN</b> e <b>COD. BARRAS</b>. Colunas <i>Nome</i>, <i>Origem</i>, <i>Categoria</i> e <i>Medida</i>, quando
        existem, têm prioridade. Sem coluna de origem, vale a escolha ao lado.
      </p>
      {msg && <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm font-medium text-ink-900">{msg}</p>}

      {/* Novo produto */}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3">
        <div className="flex-1 min-w-[8rem]"><label className="text-xs">Nome</label><Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" /></div>
        <div className="w-32"><Select label="Origem" size="sm" value={origin} onValueChange={setOrigin} options={[{ value: 'FABRICA', label: 'Fábrica' }, { value: 'CD', label: 'CD' }]} /></div>
        <div><label className="text-xs">Categoria</label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Geral" className="h-9 w-28 text-sm" /></div>
        <div className="w-24"><Select label="Medida" size="sm" value={measure} onValueChange={setMeasure} options={MEASURES.map((m) => ({ value: m, label: m }))} /></div>
        <div><label className="text-xs">Quant</label><Input inputMode="numeric" value={pack} onChange={(e) => setPack(e.target.value)} placeholder="24" className="h-9 w-20 text-sm" /></div>
        <div><label className="text-xs">Cód. barras</label><Input inputMode="numeric" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="opcional" className="h-9 w-40 text-sm" /></div>
        <Button size="sm" disabled={busy || !name.trim()} onClick={async () => { await post({ action: 'catUpsert', name: name.trim(), origin, category: category.trim() || 'Geral', measure, packSize: pack.trim() ? Number(pack.replace(/[^\d]/g, '')) : null, barcode: barcode.trim() || null }); setName(''); setCategory(''); setPack(''); setBarcode(''); }}><Plus className="h-4 w-4" /></Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="buscar no catálogo…" className="h-10 w-full rounded-lg border-2 border-line-strong bg-surface pl-9 pr-3 text-sm" />
      </div>

      <p className="text-xs text-ink-500">{filtered.length} de {products.length} produto(s)</p>
      <div className="space-y-1.5">
        {filtered.map((p) => (
          <div key={p.id} className={`flex items-center justify-between gap-2 rounded-lg border p-2 ${p.active ? 'bg-surface' : 'bg-canvas opacity-60'}`}>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink-900">{p.name}</p>
              <p className="text-[11px] text-ink-500">
                {p.origin === 'CD' ? 'CD' : 'Fábrica'} · {p.category} · {p.measure}
                {p.packSize ? ` · cx com ${p.packSize}` : ''}
                {p.barcode ? ` · ${p.barcode}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button onClick={() => post({ action: 'catToggle', id: p.id, active: !p.active })} disabled={busy} className="text-xs text-brand underline">{p.active ? 'desativar' : 'ativar'}</button>
              <button onClick={() => { if (confirm(`Excluir "${p.name}"?`)) post({ action: 'catDelete', id: p.id }); }} disabled={busy} className="text-danger"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
