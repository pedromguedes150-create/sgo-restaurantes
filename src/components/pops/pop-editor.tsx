'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';

export interface PopEdit {
  id: string; title: string; category: string | null;
  isInitial: boolean; recurrence: 'ONCE' | 'MONTHLY';
  unitIds: string[]; sectorNames: string[]; text: string; videos: string[];
}

export function PopEditor({ units, standardSectors, pop, redirectOnDelete }: {
  units: { id: string; name: string }[]; standardSectors: string[]; pop?: PopEdit; redirectOnDelete?: string;
}) {
  const router = useRouter();
  const editing = Boolean(pop);
  const [open, setOpen] = useState(editing);
  const [title, setTitle] = useState(pop?.title ?? '');
  const [category, setCategory] = useState(pop?.category ?? '');
  const [isInitial, setIsInitial] = useState(pop?.isInitial ?? false);
  const [recurrence, setRecurrence] = useState<'ONCE' | 'MONTHLY'>(pop?.recurrence ?? 'ONCE');
  const [sectors, setSectors] = useState<string[]>(pop?.sectorNames ?? []);
  const [newSector, setNewSector] = useState('');
  const [text, setText] = useState(pop?.text ?? '');
  const [videos, setVideos] = useState((pop?.videos ?? []).join('\n'));
  const [unitIds, setUnitIds] = useState<string[]>(pop?.unitIds ?? []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function addSector(name: string) { const n = name.trim(); if (n && !sectors.includes(n)) { setSectors((s) => [...s, n]); setIsInitial(false); } }
  function removeSector(name: string) { setSectors((s) => s.filter((x) => x !== name)); }
  const suggest = standardSectors.filter((s) => !sectors.includes(s));

  async function submit() {
    if (!title.trim() || unitIds.length === 0) { setMsg('Informe título e ao menos uma unidade.'); return; }
    setBusy(true); setMsg(null);
    try {
      const videoList = videos.split(/[\n,]+/).map((v) => v.trim()).filter(Boolean);
      const body = { id: pop?.id, title, category, text, videos: videoList, unitIds, isInitial, recurrence, sectorNames: sectors };
      const res = await fetch('/api/pops', { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(data.error ?? 'Falha'); return; }
      if (!editing) { setTitle(''); setCategory(''); setSectors([]); setText(''); setVideos(''); setUnitIds([]); setIsInitial(false); setRecurrence('ONCE'); setOpen(false); }
      router.refresh();
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!pop) return;
    if (!confirm(`Excluir o POP "${pop.title}"? Os registros de treinamento vinculados também serão removidos.`)) return;
    setBusy(true);
    try {
      const res = await fetch('/api/pops', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pop.id }) });
      if (res.ok) { if (redirectOnDelete) router.push(redirectOnDelete); router.refresh(); }
      else { const d = await res.json().catch(() => ({})); setMsg(d.error ?? 'Falha'); }
    } finally { setBusy(false); }
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)} variant="gold" className="w-full"><Plus className="h-5 w-5" /> Novo POP</Button>;
  }

  return (
    <div className="rounded-lg border border-dashed p-3">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">{editing ? 'Editar POP' : 'Novo POP (Admin)'}</h2>
      <div className="space-y-2">
        <div><Label>Título</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><Label>Categoria</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Função/Equipamento/Processo" /></div>

        {/* Treinamento */}
        <div className="rounded-lg bg-muted/40 p-2">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Treinamento — escolha UM tipo</p>
          <label className={`flex items-center gap-2 text-sm ${sectors.length > 0 ? 'opacity-50' : ''}`}>
            <input type="checkbox" checked={isInitial} disabled={sectors.length > 0} onChange={(e) => { setIsInitial(e.target.checked); if (e.target.checked) setSectors([]); }} />
            Inicial — TODO colaborador da unidade faz (independe do setor)
          </label>
          <div className="mt-2">
            <Label className="text-xs">Ou setorial — só os setores abaixo {isInitial && <span className="text-critical">(desmarque a opção Inicial para usar)</span>}</Label>
            <div className="mt-1 flex flex-wrap gap-1">
              {sectors.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">{s}<button onClick={() => removeSector(s)} aria-label="Remover"><X className="h-3 w-3" /></button></span>
              ))}
              {sectors.length === 0 && <span className="text-xs text-muted-foreground">Nenhum setor — será só inicial/geral.</span>}
            </div>
            {suggest.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {suggest.map((s) => <button key={s} type="button" onClick={() => addSector(s)} className="rounded-full border px-2 py-0.5 text-xs hover:border-accent">+ {s}</button>)}
              </div>
            )}
            <div className="mt-1 flex gap-1">
              <Input value={newSector} onChange={(e) => setNewSector(e.target.value)} placeholder="adicionar outro setor" className="h-9 text-sm" />
              <Button size="sm" variant="outline" onClick={() => { addSector(newSector); setNewSector(''); }}>Adicionar</Button>
            </div>
          </div>
          <div className="mt-2">
            <Label className="text-xs">Recorrência</Label>
            <select className="ml-2 h-9 rounded-lg border-2 border-input bg-background px-2 text-sm" value={recurrence} onChange={(e) => setRecurrence(e.target.value as 'ONCE' | 'MONTHLY')}>
              <option value="ONCE">Único (faz uma vez)</option>
              <option value="MONTHLY">Mensal (reciclagem todo mês)</option>
            </select>
          </div>
        </div>

        <div>
          <Label>Conteúdo</Label>
          <textarea rows={4} className="w-full rounded-lg border-2 border-input bg-background p-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div>
          <Label>Vídeos do YouTube — um link por linha</Label>
          <textarea rows={2} className="w-full rounded-lg border-2 border-input bg-background p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={videos} onChange={(e) => setVideos(e.target.value)} placeholder="https://youtu.be/..." />
        </div>
        <div>
          <Label>Unidades</Label>
          <MultiSelect options={units.map((u) => ({ value: u.id, label: u.name }))} selected={unitIds} onChange={setUnitIds} placeholder="Escolha as unidades…" searchable={units.length > 6} />
        </div>
        {editing && <p className="text-xs text-muted-foreground">Editar o conteúdo gera uma nova versão e os colaboradores precisarão refazer o treinamento.</p>}
        {msg && <p className="text-sm font-medium text-critical">{msg}</p>}
        <div className="flex gap-2">
          <Button onClick={submit} disabled={busy} className="flex-1">{editing ? 'Salvar' : 'Publicar'}</Button>
          {!editing && <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>}
          {editing && <Button variant="ghost" className="text-critical" onClick={remove} disabled={busy}><Trash2 className="h-4 w-4" /> Excluir</Button>}
        </div>
      </div>
    </div>
  );
}
