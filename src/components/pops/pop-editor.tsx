'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Trash2, Bold, Italic, List, ListOrdered, Heading, Link2, GripVertical, ChevronUp, ChevronDown, Type, CheckSquare, Image as ImageIcon, Youtube } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import type { PopBlock } from '@/lib/pops';
import { Select } from '@/components/ui/ds/select';

export interface PopEdit {
  id: string; title: string; category: string | null;
  isInitial: boolean; recurrence: 'ONCE' | 'MONTHLY';
  unitIds: string[]; sectorNames: string[]; blocks: PopBlock[];
}

interface EditorBlock { key: number; type: PopBlock['type']; text: string; url: string; items: string }

let BLOCK_SEQ = 1;
function toEditor(blocks: PopBlock[]): EditorBlock[] {
  return blocks.map((b) => ({
    key: BLOCK_SEQ++,
    type: b.type,
    text: b.text ?? '',
    url: b.url ?? '',
    items: (b.items ?? []).join('\n'),
  }));
}
function toPayload(blocks: EditorBlock[]): PopBlock[] {
  return blocks.map((b) => {
    if (b.type === 'text') return { type: 'text', text: b.text };
    if (b.type === 'checklist') return { type: 'checklist', items: b.items.split('\n').map((s) => s.trim()).filter(Boolean) };
    return { type: b.type, url: b.url.trim() };
  });
}

/** Editor de texto rico (negrito/itálico/listas/H2/link) sobre contentEditable. */
function RichText({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const inited = useRef(false);
  useEffect(() => { if (ref.current && !inited.current) { ref.current.innerHTML = value || ''; inited.current = true; } }, [value]);
  function exec(cmd: string, arg?: string) {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    onChange(ref.current?.innerHTML ?? '');
  }
  function addLink() {
    const url = window.prompt('Endereço do link (https://...)');
    if (url && /^(https?:|mailto:)/i.test(url)) exec('createLink', url);
  }
  const btn = 'rounded border px-2 py-1 text-sm hover:bg-sunken';
  return (
    <div className="rounded-lg border-2 border-line-strong bg-sgo-surface">
      <div className="flex flex-wrap gap-1 border-b p-1">
        <button type="button" className={btn} title="Negrito" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')}><Bold className="h-4 w-4" /></button>
        <button type="button" className={btn} title="Itálico" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')}><Italic className="h-4 w-4" /></button>
        <button type="button" className={btn} title="Subtítulo" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('formatBlock', 'H2')}><Heading className="h-4 w-4" /></button>
        <button type="button" className={btn} title="Lista" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertUnorderedList')}><List className="h-4 w-4" /></button>
        <button type="button" className={btn} title="Lista numerada" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertOrderedList')}><ListOrdered className="h-4 w-4" /></button>
        <button type="button" className={btn} title="Link" onMouseDown={(e) => e.preventDefault()} onClick={addLink}><Link2 className="h-4 w-4" /></button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={() => onChange(ref.current?.innerHTML ?? '')}
        className="pop-rich min-h-[88px] p-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgo-brand"
      />
    </div>
  );
}

const BLOCK_LABEL: Record<PopBlock['type'], string> = { text: 'Texto', checklist: 'Checklist', image: 'Imagem', video: 'Vídeo' };

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
  const [blocks, setBlocks] = useState<EditorBlock[]>(toEditor(pop?.blocks ?? []));
  const [unitIds, setUnitIds] = useState<string[]>(pop?.unitIds ?? []);
  const [dragKey, setDragKey] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function addSector(name: string) { const n = name.trim(); if (n && !sectors.includes(n)) { setSectors((s) => [...s, n]); setIsInitial(false); } }
  function removeSector(name: string) { setSectors((s) => s.filter((x) => x !== name)); }
  const suggest = standardSectors.filter((s) => !sectors.includes(s));

  function addBlock(type: PopBlock['type']) { setBlocks((b) => [...b, { key: BLOCK_SEQ++, type, text: '', url: '', items: '' }]); }
  function updateBlock(key: number, patch: Partial<EditorBlock>) { setBlocks((b) => b.map((x) => (x.key === key ? { ...x, ...patch } : x))); }
  function removeBlock(key: number) { setBlocks((b) => b.filter((x) => x.key !== key)); }
  function move(key: number, dir: -1 | 1) {
    setBlocks((b) => {
      const i = b.findIndex((x) => x.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= b.length) return b;
      const copy = [...b];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }
  function onDrop(targetKey: number) {
    if (dragKey === null || dragKey === targetKey) return;
    setBlocks((b) => {
      const from = b.findIndex((x) => x.key === dragKey);
      const to = b.findIndex((x) => x.key === targetKey);
      if (from < 0 || to < 0) return b;
      const copy = [...b];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      return copy;
    });
    setDragKey(null);
  }

  async function submit() {
    if (!title.trim() || unitIds.length === 0) { setMsg('Informe título e ao menos uma unidade.'); return; }
    setBusy(true); setMsg(null);
    try {
      const body = { id: pop?.id, title, category, blocks: toPayload(blocks), unitIds, isInitial, recurrence, sectorNames: sectors };
      const res = await fetch('/api/pops', { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(data.error ?? 'Falha'); return; }
      if (!editing) { setTitle(''); setCategory(''); setSectors([]); setBlocks([]); setUnitIds([]); setIsInitial(false); setRecurrence('ONCE'); setOpen(false); }
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
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-500">{editing ? 'Editar POP' : 'Novo POP (Admin)'}</h2>
      <div className="space-y-2">
        <div><Label>Título</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><Label>Categoria</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Função/Equipamento/Processo" /></div>

        {/* Treinamento */}
        <div className="rounded-lg bg-sunken/40 p-2">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">Treinamento — escolha UM tipo</p>
          <label className={`flex items-center gap-2 text-sm ${sectors.length > 0 ? 'opacity-50' : ''}`}>
            <input type="checkbox" checked={isInitial} disabled={sectors.length > 0} onChange={(e) => { setIsInitial(e.target.checked); if (e.target.checked) setSectors([]); }} />
            Inicial — TODO colaborador da unidade faz (independe do setor)
          </label>
          <div className="mt-2">
            <Label className="text-xs">Ou setorial — só os setores abaixo {isInitial && <span className="text-danger">(desmarque a opção Inicial para usar)</span>}</Label>
            <div className="mt-1 flex flex-wrap gap-1">
              {sectors.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 rounded-full bg-sgo-brand px-2.5 py-1 text-xs font-semibold text-on-brand">{s}<button onClick={() => removeSector(s)} aria-label="Remover"><X className="h-3 w-3" /></button></span>
              ))}
              {sectors.length === 0 && <span className="text-xs text-ink-500">Nenhum setor — será só inicial/geral.</span>}
            </div>
            {suggest.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {suggest.map((s) => <button key={s} type="button" onClick={() => addSector(s)} className="rounded-full border px-2 py-0.5 text-xs hover:border-sgo-brand">+ {s}</button>)}
              </div>
            )}
            <div className="mt-1 flex gap-1">
              <Input value={newSector} onChange={(e) => setNewSector(e.target.value)} placeholder="adicionar outro setor" className="h-9 text-sm" />
              <Button size="sm" variant="outline" onClick={() => { addSector(newSector); setNewSector(''); }}>Adicionar</Button>
            </div>
          </div>
          <div className="mt-2">
            <div className="w-56">
              <Select
                label="Recorrência" size="sm" value={recurrence} onValueChange={(v) => setRecurrence(v as 'ONCE' | 'MONTHLY')}
                options={[
                  { value: 'ONCE', label: 'Único', hint: 'faz uma vez' },
                  { value: 'MONTHLY', label: 'Mensal', hint: 'reciclagem todo mês' },
                ]}
              />
            </div>
          </div>
        </div>

        {/* Blocos de conteúdo */}
        <div>
          <Label>Conteúdo</Label>
          <p className="mb-1 text-xs text-ink-500">Monte o POP em blocos. Arraste pelo <GripVertical className="inline h-3 w-3" /> (ou use ▲▼) para reordenar.</p>
          <div className="space-y-2">
            {blocks.map((b) => (
              <div
                key={b.key}
                draggable
                onDragStart={() => setDragKey(b.key)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(b.key)}
                className={`rounded-lg border bg-sgo-surface p-2 ${dragKey === b.key ? 'opacity-50' : ''}`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="cursor-grab text-ink-500" title="Arraste para reordenar"><GripVertical className="h-4 w-4" /></span>
                  <span className="text-xs font-bold uppercase tracking-wide text-ink-500">{BLOCK_LABEL[b.type]}</span>
                  <div className="ml-auto flex items-center gap-1">
                    <button type="button" className="rounded border px-1.5 py-1 hover:bg-sunken" title="Subir" onClick={() => move(b.key, -1)}><ChevronUp className="h-4 w-4" /></button>
                    <button type="button" className="rounded border px-1.5 py-1 hover:bg-sunken" title="Descer" onClick={() => move(b.key, 1)}><ChevronDown className="h-4 w-4" /></button>
                    <button type="button" className="rounded border px-1.5 py-1 text-danger hover:bg-sunken" title="Remover bloco" onClick={() => removeBlock(b.key)}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                {b.type === 'text' && <RichText value={b.text} onChange={(html) => updateBlock(b.key, { text: html })} />}
                {b.type === 'checklist' && (
                  <textarea rows={3} className="w-full rounded-lg border-2 border-line-strong bg-sgo-surface p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sgo-brand" placeholder="Um item por linha" value={b.items} onChange={(e) => updateBlock(b.key, { items: e.target.value })} />
                )}
                {b.type === 'image' && (
                  <Input value={b.url} onChange={(e) => updateBlock(b.key, { url: e.target.value })} placeholder="URL da imagem (https://...)" className="h-9 text-sm" />
                )}
                {b.type === 'video' && (
                  <Input value={b.url} onChange={(e) => updateBlock(b.key, { url: e.target.value })} placeholder="Link do YouTube (https://youtu.be/...)" className="h-9 text-sm" />
                )}
              </div>
            ))}
            {blocks.length === 0 && <p className="rounded-lg border border-dashed p-3 text-center text-sm text-ink-500">Nenhum bloco ainda. Adicione abaixo.</p>}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            <Button type="button" size="sm" variant="outline" onClick={() => addBlock('text')}><Type className="h-4 w-4" /> Texto</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => addBlock('checklist')}><CheckSquare className="h-4 w-4" /> Checklist</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => addBlock('image')}><ImageIcon className="h-4 w-4" /> Imagem</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => addBlock('video')}><Youtube className="h-4 w-4" /> Vídeo</Button>
          </div>
        </div>

        <div>
          <Label>Unidades</Label>
          <MultiSelect options={units.map((u) => ({ value: u.id, label: u.name }))} selected={unitIds} onChange={setUnitIds} placeholder="Escolha as unidades…" searchable={units.length > 6} />
        </div>
        {editing && <p className="text-xs text-ink-500">Editar o conteúdo gera uma nova versão e os colaboradores precisarão refazer o treinamento.</p>}
        {msg && <p className="text-sm font-medium text-danger">{msg}</p>}
        <div className="flex gap-2">
          <Button onClick={submit} disabled={busy} className="flex-1">{editing ? 'Salvar' : 'Publicar'}</Button>
          {!editing && <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>}
          {editing && <Button variant="ghost" className="text-danger" onClick={remove} disabled={busy}><Trash2 className="h-4 w-4" /> Excluir</Button>}
        </div>
      </div>
    </div>
  );
}
