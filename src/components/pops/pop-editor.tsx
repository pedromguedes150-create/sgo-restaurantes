'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Trash2, Bold, Italic, List, ListOrdered, Heading, Link2, GripVertical, ChevronUp, ChevronDown, ChevronRight, Type, CheckSquare, Image as ImageIcon, Youtube, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import type { PopBlock } from '@/lib/pops';
import { Select } from '@/components/ui/ds/select';
import { SegmentedControl } from '@/components/ui/ds/segmented-control';
import type { OpcoesDePublico } from '@/lib/treinamentos/publico';

/**
 * EDITOR DO POP COM MÓDULOS (v1.124.0).
 *
 * POP = título, categoria, unidades, recorrência. Dentro dele, MÓDULOS/ETAPAS
 * (Desperdício, Conferência, Manuseio…), cada um com o SEU público e o SEU
 * conteúdo em blocos. A atribuição acontece no módulo: um Auxiliar de Cozinha
 * recebe só os módulos da função dele. Módulos recolhem/expandem para a tela
 * não virar uma parede.
 *
 * Público do módulo: "Todos abrangidos pelo POP" (independe da função) ou
 * DIRECIONADO — funções (distribuição principal) + colaboradores adicionais
 * (exceção) + setores do Mapa (regra anterior, opcional).
 */

export interface PopModuleEdit {
  id?: string;
  name: string;
  allPublic: boolean;
  jobTitles: string[];
  collaboratorIds: string[];
  sectorNames: string[];
  blocks: PopBlock[];
}
export interface PopEdit {
  id: string; title: string; category: string | null;
  recurrence: 'ONCE' | 'MONTHLY';
  unitIds: string[];
  modules: PopModuleEdit[];
}

type Publico = 'GERAL' | 'DIRECIONADO';
interface EditorBlock { key: number; type: PopBlock['type']; text: string; url: string; items: string }
interface EditorModule {
  key: number; id?: string; name: string; tipo: Publico;
  jobTitles: string[]; collaboratorIds: string[]; sectorNames: string[];
  blocks: EditorBlock[]; expanded: boolean; mostrarSetores: boolean; newSector: string;
}

let SEQ = 1;
function toEditorBlocks(blocks: PopBlock[]): EditorBlock[] {
  return blocks.map((b) => ({ key: SEQ++, type: b.type, text: b.text ?? '', url: b.url ?? '', items: (b.items ?? []).join('\n') }));
}
function toPayloadBlocks(blocks: EditorBlock[]): PopBlock[] {
  return blocks.map((b) => {
    if (b.type === 'text') return { type: 'text', text: b.text };
    if (b.type === 'checklist') return { type: 'checklist', items: b.items.split('\n').map((s) => s.trim()).filter(Boolean) };
    return { type: b.type, url: b.url.trim() };
  });
}
function toEditorModule(m: PopModuleEdit, expanded: boolean): EditorModule {
  return {
    key: SEQ++, id: m.id, name: m.name,
    tipo: m.allPublic ? 'GERAL' : 'DIRECIONADO',
    jobTitles: m.jobTitles, collaboratorIds: m.collaboratorIds, sectorNames: m.sectorNames,
    blocks: toEditorBlocks(m.blocks), expanded, mostrarSetores: m.sectorNames.length > 0, newSector: '',
  };
}
function novoModulo(n: number): EditorModule {
  return { key: SEQ++, name: n === 1 ? '' : '', tipo: 'GERAL', jobTitles: [], collaboratorIds: [], sectorNames: [], blocks: [], expanded: true, mostrarSetores: false, newSector: '' };
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
    <div className="rounded-lg border-2 border-line-strong bg-surface">
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
        className="pop-rich min-h-[88px] p-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      />
    </div>
  );
}

const BLOCK_LABEL: Record<PopBlock['type'], string> = { text: 'Texto', checklist: 'Checklist', image: 'Imagem', video: 'Vídeo' };

/** Resumo do público para o cabeçalho recolhido do módulo. */
function resumoPublico(m: EditorModule, colabs: OpcoesDePublico['colaboradores']): string {
  if (m.tipo === 'GERAL') return 'Todos abrangidos pelo POP';
  const partes: string[] = [];
  if (m.jobTitles.length) partes.push(m.jobTitles.join(', '));
  if (m.collaboratorIds.length) partes.push(`+${m.collaboratorIds.length} colaborador(es)`);
  if (m.sectorNames.length) partes.push(`setores: ${m.sectorNames.join(', ')}`);
  void colabs;
  return partes.join(' · ') || 'Sem público (só referência)';
}

export function PopEditor({ units, standardSectors, publico, pop, redirectOnDelete }: {
  units: { id: string; name: string }[]; standardSectors: string[]; publico: OpcoesDePublico; pop?: PopEdit; redirectOnDelete?: string;
}) {
  const router = useRouter();
  const editing = Boolean(pop);
  const [open, setOpen] = useState(editing);
  const [title, setTitle] = useState(pop?.title ?? '');
  const [category, setCategory] = useState(pop?.category ?? '');
  const [recurrence, setRecurrence] = useState<'ONCE' | 'MONTHLY'>(pop?.recurrence ?? 'ONCE');
  const [unitIds, setUnitIds] = useState<string[]>(pop?.unitIds ?? []);
  const [modules, setModules] = useState<EditorModule[]>(() =>
    pop && pop.modules.length ? pop.modules.map((m, i) => toEditorModule(m, i === 0)) : [novoModulo(1)],
  );
  const [drag, setDrag] = useState<{ mod: number; block: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const colabsDasUnidades = publico.colaboradores.filter((c) => unitIds.length === 0 || c.unitIds.some((u) => unitIds.includes(u)));

  function upd(key: number, patch: Partial<EditorModule> | ((m: EditorModule) => Partial<EditorModule>)) {
    setModules((ms) => ms.map((m) => (m.key === key ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m)));
  }
  function updBlocks(key: number, fn: (b: EditorBlock[]) => EditorBlock[]) {
    upd(key, (m) => ({ blocks: fn(m.blocks) }));
  }
  function addModule() {
    setModules((ms) => [...ms.map((m) => ({ ...m, expanded: false })), novoModulo(ms.length + 1)]);
  }
  function removeModule(key: number) {
    const m = modules.find((x) => x.key === key);
    if (!m) return;
    if (m.id && !confirm(`Remover o módulo "${m.name || 'sem nome'}"? Quem já concluiu mantém o histórico; as pendências dele somem.`)) return;
    setModules((ms) => ms.filter((x) => x.key !== key));
  }
  function moveModule(key: number, dir: -1 | 1) {
    setModules((ms) => {
      const i = ms.findIndex((x) => x.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ms.length) return ms;
      const copy = [...ms];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  function addBlock(key: number, type: PopBlock['type']) { updBlocks(key, (b) => [...b, { key: SEQ++, type, text: '', url: '', items: '' }]); }
  function updateBlock(key: number, bkey: number, patch: Partial<EditorBlock>) { updBlocks(key, (b) => b.map((x) => (x.key === bkey ? { ...x, ...patch } : x))); }
  function removeBlock(key: number, bkey: number) { updBlocks(key, (b) => b.filter((x) => x.key !== bkey)); }
  function moveBlock(key: number, bkey: number, dir: -1 | 1) {
    updBlocks(key, (b) => {
      const i = b.findIndex((x) => x.key === bkey);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= b.length) return b;
      const copy = [...b];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }
  function onDropBlock(key: number, targetKey: number) {
    if (!drag || drag.mod !== key || drag.block === targetKey) { setDrag(null); return; }
    updBlocks(key, (b) => {
      const from = b.findIndex((x) => x.key === drag.block);
      const to = b.findIndex((x) => x.key === targetKey);
      if (from < 0 || to < 0) return b;
      const copy = [...b];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      return copy;
    });
    setDrag(null);
  }

  async function submit() {
    if (!title.trim() || unitIds.length === 0) { setMsg('Informe título e ao menos uma unidade.'); return; }
    if (modules.length === 0) { setMsg('Adicione ao menos um módulo.'); return; }
    const semNome = modules.find((m) => !m.name.trim());
    if (semNome) { setMsg('Todo módulo precisa de nome.'); upd(semNome.key, { expanded: true }); return; }
    setBusy(true); setMsg(null);
    try {
      const body = {
        id: pop?.id, title, category, unitIds, recurrence,
        modules: modules.map((m) => ({
          id: m.id, name: m.name.trim(),
          allPublic: m.tipo === 'GERAL',
          jobTitles: m.tipo === 'GERAL' ? [] : m.jobTitles,
          collaboratorIds: m.tipo === 'GERAL' ? [] : m.collaboratorIds,
          sectorNames: m.tipo === 'GERAL' ? [] : m.sectorNames,
          blocks: toPayloadBlocks(m.blocks),
        })),
      };
      const res = await fetch('/api/pops', { method: editing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(data.error ?? 'Falha'); return; }
      if (!editing) { setTitle(''); setCategory(''); setUnitIds([]); setRecurrence('ONCE'); setModules([novoModulo(1)]); setOpen(false); }
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
      <h2 className="mb-2 sgo-type-11 font-semibold text-ink-900">{editing ? 'Editar POP' : 'Novo POP (Admin)'}</h2>
      <div className="space-y-3">
        <div><Label>Título</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: POP — Operacional" /></div>
        <div><Label>Categoria</Label><Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Função/Equipamento/Processo" /></div>
        <div>
          <Label>Unidades</Label>
          <MultiSelect options={units.map((u) => ({ value: u.id, label: u.name }))} selected={unitIds} onChange={setUnitIds} placeholder="Escolha as unidades…" searchable={units.length > 6} />
        </div>
        <div className="w-56">
          <Select
            label="Recorrência" size="sm" value={recurrence} onValueChange={(v) => setRecurrence(v as 'ONCE' | 'MONTHLY')}
            options={[
              { value: 'ONCE', label: 'Único', hint: 'faz uma vez' },
              { value: 'MONTHLY', label: 'Mensal', hint: 'reciclagem todo mês' },
            ]}
          />
        </div>

        {/* MÓDULOS DO TREINAMENTO */}
        <div className="rounded-lg bg-sunken/40 p-2">
          <p className="mb-1 flex items-center gap-1 sgo-type-11 font-semibold text-ink-500"><Layers className="h-3.5 w-3.5" /> Módulos do treinamento</p>
          <p className="mb-2 text-xs text-ink-500">Cada módulo tem o seu público e o seu conteúdo. Cada colaborador só deve os módulos aplicáveis a ele.</p>
          <div className="space-y-2">
            {modules.map((m, idx) => (
              <div key={m.key} className="rounded-lg border bg-surface">
                <div className="flex items-center gap-2 p-2">
                  <button type="button" aria-expanded={m.expanded} onClick={() => upd(m.key, { expanded: !m.expanded })} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    {m.expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-ink-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-ink-500" />}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink-900">{m.name.trim() || `Módulo ${idx + 1} (sem nome)`}</span>
                      <span className="block truncate text-xs text-ink-500">Público: {resumoPublico(m, publico.colaboradores)} · {m.blocks.length} bloco(s)</span>
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" className="rounded border px-1.5 py-1 hover:bg-sunken" title="Subir" onClick={() => moveModule(m.key, -1)}><ChevronUp className="h-4 w-4" /></button>
                    <button type="button" className="rounded border px-1.5 py-1 hover:bg-sunken" title="Descer" onClick={() => moveModule(m.key, 1)}><ChevronDown className="h-4 w-4" /></button>
                    <button type="button" className="rounded border px-1.5 py-1 text-danger hover:bg-sunken" title="Remover módulo" onClick={() => removeModule(m.key)}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>

                {m.expanded && (
                  <div className="space-y-2 border-t p-2">
                    <div><Label>Nome do módulo</Label><Input value={m.name} onChange={(e) => upd(m.key, { name: e.target.value })} placeholder="Ex.: Desperdício" /></div>

                    <div className="space-y-2 rounded-lg bg-sunken/40 p-2">
                      <p className="sgo-type-11 font-semibold text-ink-500">Público do módulo</p>
                      <SegmentedControl<Publico>
                        aria-label={`Público do módulo ${m.name || idx + 1}`}
                        size="sm"
                        value={m.tipo}
                        onValueChange={(v) => upd(m.key, { tipo: v })}
                        options={[
                          { value: 'GERAL', label: 'Todos abrangidos pelo POP' },
                          { value: 'DIRECIONADO', label: 'Direcionado' },
                        ]}
                      />
                      {m.tipo === 'GERAL' && <p className="text-xs text-ink-500">Todos os colaboradores das unidades do POP, independentemente da função.</p>}
                      {m.tipo === 'DIRECIONADO' && (
                        <div className="space-y-2">
                          <div>
                            <Label>Funções responsáveis</Label>
                            <p className="mb-1 text-xs text-ink-500">Quem tem a função nas unidades do POP recebe este módulo — e quem entra ou sai da função, também.</p>
                            <MultiSelect
                              options={[...new Set([...publico.funcoes, ...m.jobTitles])].sort((a, b) => a.localeCompare(b, 'pt-BR')).map((f) => ({ value: f, label: f }))}
                              selected={m.jobTitles}
                              onChange={(v) => upd(m.key, { jobTitles: v })}
                              placeholder="Buscar função…"
                              searchable
                              allLabel="todas as funções"
                              emptyLabel="Nenhuma função cadastrada nos colaboradores"
                            />
                          </div>
                          <div>
                            <Label>Colaboradores adicionais (opcional)</Label>
                            <p className="mb-1 text-xs text-ink-500">Exceção: quem executa esta atividade sem ter a função. Não muda a função no cadastro.</p>
                            <MultiSelect
                              options={colabsDasUnidades.map((c) => ({ value: c.id, label: `${c.name}${c.jobTitle ? ` — ${c.jobTitle}` : ''} (${c.unitNames.join(', ')})` }))}
                              selected={m.collaboratorIds}
                              onChange={(v) => upd(m.key, { collaboratorIds: v })}
                              placeholder={unitIds.length === 0 ? 'Escolha as unidades primeiro…' : 'Buscar colaborador…'}
                              searchable
                              allLabel="todos"
                              emptyLabel="Nenhum colaborador nas unidades escolhidas"
                              disabled={unitIds.length === 0}
                            />
                          </div>
                          <div>
                            <button type="button" className="text-xs font-semibold text-brand" onClick={() => upd(m.key, { mostrarSetores: !m.mostrarSetores })}>
                              {m.mostrarSetores ? '▾' : '▸'} Setores do Mapa de Funções (opcional){m.sectorNames.length > 0 ? ` · ${m.sectorNames.length}` : ''}
                            </button>
                            {m.mostrarSetores && (
                              <div className="mt-1">
                                <div className="flex flex-wrap gap-1">
                                  {m.sectorNames.map((s) => (
                                    <span key={s} className="inline-flex items-center gap-1 rounded-full bg-brand-tint-2 px-2.5 py-1 text-xs font-semibold text-brand">{s}<button onClick={() => upd(m.key, (x) => ({ sectorNames: x.sectorNames.filter((y) => y !== s) }))} aria-label="Remover"><X className="h-3 w-3" /></button></span>
                                  ))}
                                  {m.sectorNames.length === 0 && <span className="text-xs text-ink-500">Nenhum setor.</span>}
                                </div>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {standardSectors.filter((s) => !m.sectorNames.includes(s)).map((s) => (
                                    <button key={s} type="button" onClick={() => upd(m.key, (x) => ({ sectorNames: [...x.sectorNames, s] }))} className="rounded-full border px-2 py-0.5 text-xs hover:border-brand">+ {s}</button>
                                  ))}
                                </div>
                                <div className="mt-1 flex gap-1">
                                  <Input value={m.newSector} onChange={(e) => upd(m.key, { newSector: e.target.value })} placeholder="adicionar outro setor" className="h-9 text-sm" />
                                  <Button size="sm" variant="outline" onClick={() => upd(m.key, (x) => { const n = x.newSector.trim(); return { newSector: '', sectorNames: n && !x.sectorNames.includes(n) ? [...x.sectorNames, n] : x.sectorNames }; })}>Adicionar</Button>
                                </div>
                              </div>
                            )}
                          </div>
                          {m.jobTitles.length === 0 && m.collaboratorIds.length === 0 && m.sectorNames.length === 0 && (
                            <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs font-medium text-warning">Sem função, colaborador nem setor, este módulo fica só como referência: não gera treinamento para ninguém.</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Conteúdo do módulo */}
                    <div>
                      <Label>Conteúdo do módulo</Label>
                      <p className="mb-1 text-xs text-ink-500">Blocos de texto, checklist, imagem e vídeo. Arraste pelo <GripVertical className="inline h-3 w-3" /> (ou use ▲▼) para reordenar.</p>
                      <div className="space-y-2">
                        {m.blocks.map((b) => (
                          <div
                            key={b.key}
                            draggable
                            onDragStart={() => setDrag({ mod: m.key, block: b.key })}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => onDropBlock(m.key, b.key)}
                            className={`rounded-lg border bg-surface p-2 ${drag?.block === b.key ? 'opacity-50' : ''}`}
                          >
                            <div className="mb-1 flex items-center gap-2">
                              <span className="cursor-grab text-ink-500" title="Arraste para reordenar"><GripVertical className="h-4 w-4" /></span>
                              <span className="sgo-type-11 font-semibold text-ink-500">{BLOCK_LABEL[b.type]}</span>
                              <div className="ml-auto flex items-center gap-1">
                                <button type="button" className="rounded border px-1.5 py-1 hover:bg-sunken" title="Subir" onClick={() => moveBlock(m.key, b.key, -1)}><ChevronUp className="h-4 w-4" /></button>
                                <button type="button" className="rounded border px-1.5 py-1 hover:bg-sunken" title="Descer" onClick={() => moveBlock(m.key, b.key, 1)}><ChevronDown className="h-4 w-4" /></button>
                                <button type="button" className="rounded border px-1.5 py-1 text-danger hover:bg-sunken" title="Remover bloco" onClick={() => removeBlock(m.key, b.key)}><Trash2 className="h-4 w-4" /></button>
                              </div>
                            </div>
                            {b.type === 'text' && <RichText value={b.text} onChange={(html) => updateBlock(m.key, b.key, { text: html })} />}
                            {b.type === 'checklist' && (
                              <textarea rows={3} className="w-full rounded-lg border-2 border-line-strong bg-surface p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" placeholder="Um item por linha" value={b.items} onChange={(e) => updateBlock(m.key, b.key, { items: e.target.value })} />
                            )}
                            {b.type === 'image' && (
                              <Input value={b.url} onChange={(e) => updateBlock(m.key, b.key, { url: e.target.value })} placeholder="URL da imagem (https://...)" className="h-9 text-sm" />
                            )}
                            {b.type === 'video' && (
                              <Input value={b.url} onChange={(e) => updateBlock(m.key, b.key, { url: e.target.value })} placeholder="Link do YouTube (https://youtu.be/...)" className="h-9 text-sm" />
                            )}
                          </div>
                        ))}
                        {m.blocks.length === 0 && <p className="rounded-lg border border-dashed p-3 text-center text-sm text-ink-500">Nenhum bloco ainda. Adicione abaixo.</p>}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Button type="button" size="sm" variant="outline" onClick={() => addBlock(m.key, 'text')}><Type className="h-4 w-4" /> Texto</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => addBlock(m.key, 'checklist')}><CheckSquare className="h-4 w-4" /> Checklist</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => addBlock(m.key, 'image')}><ImageIcon className="h-4 w-4" /> Imagem</Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => addBlock(m.key, 'video')}><Youtube className="h-4 w-4" /> Vídeo</Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <Button type="button" size="sm" variant="outline" className="mt-2" onClick={addModule}><Plus className="h-4 w-4" /> Adicionar módulo</Button>
        </div>

        {editing && <p className="text-xs text-ink-500">Editar o conteúdo de um módulo sobe a versão DELE e os colaboradores refazem só esse módulo. Remover um módulo mantém o histórico de quem já o concluiu.</p>}
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
