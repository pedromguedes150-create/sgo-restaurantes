'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Check, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { compressImage } from '@/lib/image-compress';

type ItemStatus = 'OK' | 'EM_CORRECAO' | 'A_CORRIGIR' | 'NAO_SE_APLICA';
interface Item { id: string; section: string | null; text: string; requiresPhoto: boolean; aiCheck?: boolean }
interface AiState { loading?: boolean; configured?: boolean; verdict?: 'COMPATIVEL' | 'DIVERGENTE' | 'INCERTO'; observations?: string; error?: string }
interface Answer { status: ItemStatus; note?: string }

const ST: Record<ItemStatus, { label: string; short: string; cls: string }> = {
  OK:            { label: 'De acordo',    short: '🟢', cls: 'bg-success text-on-brand border-success' },
  EM_CORRECAO:   { label: 'Em correção',  short: '🟡', cls: 'bg-warning-bg text-warning border-warning' },
  A_CORRIGIR:    { label: 'A corrigir',   short: '🔴', cls: 'bg-danger text-on-brand border-danger' },
  NAO_SE_APLICA: { label: 'Não se aplica', short: '⚪', cls: 'bg-sunken text-ink-500 border-line-strong' },
};
const STATUSES: ItemStatus[] = ['OK', 'EM_CORRECAO', 'A_CORRIGIR', 'NAO_SE_APLICA'];

export function ChecklistRunner({ instanceId, requiresEvidence, done, lateStatus, items, initialAnswers, responses = [], photos, openIssues = {} }: {
  instanceId: string; requiresEvidence: boolean; done: boolean; lateStatus: boolean;
  items: Item[]; initialAnswers: Record<string, { status: string; note?: string }>;
  /// itemId → ocorrência ABERTA gerada por este item (16/07): sinaliza sem recriar pendência
  openIssues?: Record<string, { number: number; since: string }>;
  /** Respostas registradas (snapshot do texto) — usado na visão concluída p/ não depender do ID atual do item. */
  responses?: { itemText: string; status: ItemStatus; note: string | null }[];
  photos: { path: string; itemId: string | null }[];
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => {
    const out: Record<string, Answer> = {};
    for (const [k, v] of Object.entries(initialAnswers)) out[k] = { status: v.status as ItemStatus, note: v.note };
    return out;
  });
  const [photoEntries, setPhotoEntries] = useState<{ itemId: string | null; file: File }[]>([]);
  const [ai, setAi] = useState<Record<string, AiState>>({});
  const [ps, setPs] = useState<Record<string, { loading?: boolean; configured?: boolean; verdict?: string; offStandard?: string[]; observations?: string; error?: string }>>({});

  async function analyzeProductStd(itemId: string, rawFile: File) {
    const file = await compressImage(rawFile);
    setPhotoEntries((f) => [...f, { itemId, file }].slice(0, 5));
    setPs((s) => ({ ...s, [itemId]: { loading: true } }));
    try {
      const fd = new FormData(); fd.set('photo', file);
      const res = await fetch('/api/ai/product-standard-check', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      setPs((s) => ({ ...s, [itemId]: { configured: d.configured, verdict: d.verdict, offStandard: d.offStandard, observations: d.observations, error: d.error } }));
    } catch { setPs((s) => ({ ...s, [itemId]: { error: 'Falha de conexão' } })); }
  }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function analyzeAi(itemId: string, rawFile: File) {
    const file = await compressImage(rawFile);
    setPhotoEntries((f) => [...f, { itemId, file }].slice(0, 5)); // a foto também é salva, ligada ao item
    setAi((s) => ({ ...s, [itemId]: { loading: true } }));
    try {
      const fd = new FormData();
      fd.set('itemId', itemId); fd.set('photo', file);
      const res = await fetch('/api/ai/checklist-photo', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setAi((s) => ({ ...s, [itemId]: { error: d.error ?? 'Falha' } })); return; }
      setAi((s) => ({ ...s, [itemId]: { configured: d.configured, verdict: d.verdict, observations: d.observations, error: d.error } }));
    } catch {
      setAi((s) => ({ ...s, [itemId]: { error: 'Falha de conexão' } }));
    }
  }
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-salvamento (debounce) — contra interrupções no celular
  useEffect(() => {
    if (done) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch(`/api/tasks/${instanceId}/draft`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: { answers } }) }).catch(() => {});
    }, 1500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [answers, done, instanceId]);

  function setItem(id: string, patch: Partial<Answer>) { setAnswers((a) => ({ ...a, [id]: { ...(a[id] ?? { status: 'OK' }), ...patch } })); }
  const [processing, setProcessing] = useState(false);
  async function addFiles(itemId: string | null, list: FileList | null) {
    if (!list) return;
    setProcessing(true);
    try {
      const compressed = await Promise.all(Array.from(list).map((f) => compressImage(f)));
      setPhotoEntries((f) => [...f, ...compressed.map((file) => ({ itemId, file }))].slice(0, 5));
    } finally { setProcessing(false); }
  }
  const removePhoto = (idx: number) => setPhotoEntries((arr) => arr.filter((_, i) => i !== idx));

  async function submit() {
    if (requiresEvidence && photoEntries.length === 0) { setMsg('Este checklist exige ao menos uma foto.'); return; }
    const unanswered = items.filter((i) => !answers[i.id]);
    if (unanswered.length > 0) { setMsg(`Responda todos os itens (${unanswered.length} pendente(s)).`); return; }
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.set('items', JSON.stringify(items.map((i) => ({ itemId: i.id, itemText: i.text, status: answers[i.id]?.status ?? 'OK', note: answers[i.id]?.note ?? '' }))));
      photoEntries.forEach((e) => fd.append('photos', e.file));
      fd.set('photoItemIds', JSON.stringify(photoEntries.map((e) => e.itemId)));
      const res = await fetch(`/api/tasks/${instanceId}/checklist`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(data.error ?? 'Falha ao concluir'); return; }
      router.push('/tarefas'); router.refresh();
    } finally { setBusy(false); }
  }

  // Agrupa por seção
  const groups: { section: string | null; items: Item[] }[] = [];
  for (const it of items) {
    const g = groups.find((x) => x.section === (it.section ?? null));
    if (g) g.items.push(it); else groups.push({ section: it.section ?? null, items: [it] });
  }

  /* ───── Visão concluída (somente leitura) ───── */
  if (done) {
    return (
      <div className="space-y-4">
        <p className={cn('rounded-lg px-3 py-2 text-sm font-semibold', lateStatus ? 'bg-warning/15 text-warning' : 'bg-success/10 text-success')}>
          {lateStatus ? 'Concluído fora do prazo (não conta na meta).' : 'Concluído no prazo.'}
        </p>
        {/* Visão completa a partir do SNAPSHOT das respostas (sobrevive a edições do checklist). */}
        {responses.length > 0 ? (
          <div className="space-y-1">
            {responses.map((r, i) => (
              <div key={i} className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm">
                <span>{r.itemText}{r.note ? <span className="block text-xs text-ink-500">{r.note}</span> : null}</span>
                <span className={cn('shrink-0 rounded px-2 py-0.5 text-xs font-bold', ST[r.status].cls)}>{ST[r.status].label}</span>
              </div>
            ))}
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.section ?? '_'}>
              {g.section && <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">{g.section}</p>}
              <div className="space-y-1">
                {g.items.map((it) => {
                  const a = answers[it.id];
                  return (
                    <div key={it.id} className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm">
                      <span>{it.text}{a?.note ? <span className="block text-xs text-ink-500">{a.note}</span> : null}</span>
                      {a && <span className={cn('shrink-0 rounded px-2 py-0.5 text-xs font-bold', ST[a.status].cls)}>{ST[a.status].label}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
        {photos.length > 0 && (() => {
          const textById = new Map(items.map((i) => [i.id, i.text]));
          const groups2 = new Map<string, typeof photos>();
          for (const p of photos) { const k = p.itemId ?? '_'; groups2.set(k, [...(groups2.get(k) ?? []), p]); }
          const ordered = [...groups2.entries()].sort((a, b) => (a[0] === '_' ? 1 : b[0] === '_' ? -1 : 0));
          return (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Fotos</p>
              {ordered.map(([k, ps]) => (
                <div key={k}>
                  <p className="mb-1 text-xs font-medium text-brand">{k === '_' ? 'Gerais' : (textById.get(k) ?? 'Item')}</p>
                  <div className="flex flex-wrap gap-2">
                    {ps.map((p, i) => <a key={i} href={p.path} target="_blank" rel="noreferrer"><img src={p.path} alt="" className="h-24 w-24 rounded-lg border object-cover" /></a>)}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
        {items.length === 0 && photos.length === 0 && <p className="text-sm text-ink-500">Tarefa concluída.</p>}
      </div>
    );
  }

  /* ───── Execução ───── */
  return (
    <div className="space-y-4">
      {items.length === 0 && <p className="text-sm text-ink-500">Este checklist não tem itens — basta anexar foto (se exigida) e concluir.</p>}
      {groups.map((g) => (
        <div key={g.section ?? '_'}>
          {g.section && <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">{g.section}</p>}
          <div className="space-y-2">
            {g.items.map((it) => {
              const a = answers[it.id];
              return (
                <div key={it.id} className={cn('rounded-lg border bg-surface p-2.5', openIssues[it.id] && 'border-danger/50')}>
                  <p className="text-sm font-medium">{it.text}{it.requiresPhoto && <span className="ml-1 text-xs text-ink-900">(foto)</span>}</p>
                  {openIssues[it.id] && (
                    <p className="mt-1 rounded-md bg-danger/10 px-2 py-1 text-xs font-semibold text-danger">
                      ⚠ Problema em aberto desde {openIssues[it.id].since} (ocorrência nº {openIssues[it.id].number}) — some daqui quando a ocorrência for encerrada; não gera pendência nova.
                    </p>
                  )}
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    {STATUSES.map((s) => (
                      <button key={s} onClick={() => setItem(it.id, { status: s })} className={cn('rounded-md border px-2 py-1.5 text-xs font-semibold', a?.status === s ? ST[s].cls : 'border-line-strong text-ink-500')}>
                        {ST[s].short} {ST[s].label}
                      </button>
                    ))}
                  </div>
                  {a && (a.status === 'EM_CORRECAO' || a.status === 'A_CORRIGIR') && (
                    <input value={a.note ?? ''} onChange={(e) => setItem(it.id, { note: e.target.value })} placeholder="Observação (o que corrigir)" className="mt-2 h-9 w-full rounded-md border-2 border-line-strong bg-surface px-2 text-sm" />
                  )}
                  {a && a.status === 'NAO_SE_APLICA' && (
                    <input value={a.note ?? ''} onChange={(e) => setItem(it.id, { note: e.target.value })} placeholder="Motivo (opcional)" className="mt-2 h-9 w-full rounded-md border-2 border-line-strong bg-surface px-2 text-sm" />
                  )}
                  {it.aiCheck && (
                    <div className="mt-2 rounded-md border border-dashed bg-surface/60 p-2">
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-brand">
                        <Sparkles className="h-4 w-4" /> {ai[it.id]?.loading ? 'Analisando com IA…' : 'Conferir a foto com IA'}
                        <input type="file" accept="image/*" capture="environment" hidden disabled={ai[it.id]?.loading} onChange={(e) => { const f = e.target.files?.[0]; if (f) analyzeAi(it.id, f); e.target.value = ''; }} />
                      </label>
                      {ai[it.id] && !ai[it.id].loading && (
                        ai[it.id].configured === false ? <p className="mt-1 text-xs text-ink-500">IA não configurada no servidor.</p>
                        : ai[it.id].error ? <p className="mt-1 text-xs text-danger">{ai[it.id].error}</p>
                        : ai[it.id].verdict ? (
                          <p className={cn('mt-1 text-xs font-medium', ai[it.id].verdict === 'COMPATIVEL' ? 'text-success' : ai[it.id].verdict === 'DIVERGENTE' ? 'text-danger' : 'text-warning')}>
                            {ai[it.id].verdict === 'COMPATIVEL' ? '🟢 Compatível' : ai[it.id].verdict === 'DIVERGENTE' ? '🔴 Divergente' : '🟡 Incerto'}{ai[it.id].observations ? ` — ${ai[it.id].observations}` : ''}
                          </p>
                        ) : null
                      )}
                    </div>
                  )}
                  {it.aiCheck && (
                    <div className="mt-2 rounded-md border border-dashed bg-surface/60 p-2">
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-brand">
                        <Sparkles className="h-4 w-4" /> {ps[it.id]?.loading ? 'Conferindo o padrão…' : 'Conferir padrão de produtos (IA)'}
                        <input type="file" accept="image/*" capture="environment" hidden disabled={ps[it.id]?.loading} onChange={(e) => { const f = e.target.files?.[0]; if (f) analyzeProductStd(it.id, f); e.target.value = ''; }} />
                      </label>
                      {ps[it.id] && !ps[it.id].loading && (
                        ps[it.id].configured === false ? <p className="mt-1 text-xs text-ink-500">IA não configurada / sem padrão cadastrado.</p>
                        : ps[it.id].error ? <p className="mt-1 text-xs text-danger">{ps[it.id].error}</p>
                        : (ps[it.id].offStandard && ps[it.id].offStandard!.length > 0)
                          ? <p className="mt-1 text-xs font-medium text-danger">🔴 Fora do padrão: {ps[it.id].offStandard!.join(', ')}{ps[it.id].observations ? ` — ${ps[it.id].observations}` : ''}</p>
                          : ps[it.id].verdict ? <p className="mt-1 text-xs font-medium text-success">🟢 Tudo no padrão{ps[it.id].observations ? ` — ${ps[it.id].observations}` : ''}</p> : null
                      )}
                    </div>
                  )}
                  {it.requiresPhoto && (
                    <div className="mt-2">
                      <p className="mb-1 text-xs font-semibold text-ink-900">Foto deste item</p>
                      <div className="flex flex-wrap gap-2">
                        {photoEntries.map((e, idx) => ({ e, idx })).filter((x) => x.e.itemId === it.id).map(({ e, idx }) => (
                          <div key={idx} className="relative">
                            <img src={URL.createObjectURL(e.file)} alt="" className="h-16 w-16 rounded-lg border object-cover" />
                            <button onClick={() => removePhoto(idx)} className="absolute -right-1 -top-1 rounded-full bg-danger p-0.5 text-on-brand"><X className="h-3 w-3" /></button>
                          </div>
                        ))}
                        {photoEntries.length < 5 && (
                          <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed text-[10px] text-ink-500">
                            <Camera className="h-4 w-4" /> foto
                            <input type="file" accept="image/*" capture="environment" hidden multiple onChange={(ev) => { addFiles(it.id, ev.target.files); ev.target.value = ''; }} />
                          </label>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Fotos gerais (não ligadas a um item específico) — até 5 no total */}
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">Outras fotos {requiresEvidence && <span className="text-ink-900">(exige ao menos 1)</span>} — {photoEntries.length}/5</p>
        <div className="flex flex-wrap gap-2">
          {photoEntries.map((e, i) => ({ e, i })).filter((x) => x.e.itemId === null).map(({ e, i }) => (
            <div key={i} className="relative">
              <img src={URL.createObjectURL(e.file)} alt="" className="h-20 w-20 rounded-lg border object-cover" />
              <button onClick={() => removePhoto(i)} className="absolute -right-1 -top-1 rounded-full bg-danger p-0.5 text-on-brand"><X className="h-3 w-3" /></button>
            </div>
          ))}
          {photoEntries.length < 5 && (
            <button onClick={() => fileRef.current?.click()} disabled={processing} className="flex h-20 w-20 flex-col items-center justify-center rounded-lg border-2 border-dashed text-xs text-ink-500 disabled:opacity-60">
              <Camera className="h-5 w-5" /> {processing ? 'aguarde…' : 'foto'}
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden multiple onChange={(e) => { addFiles(null, e.target.files); e.target.value = ''; }} />
      </div>

      {msg && <p className="text-sm font-medium text-danger">{msg}</p>}
      <p className="text-[11px] text-ink-500">Seu preenchimento é salvo automaticamente — se for interrompido, retoma de onde parou.</p>
      <Button onClick={submit} disabled={busy} size="lg" className="w-full md:w-auto md:px-10"><Check className="h-5 w-5" /> {busy ? 'Concluindo…' : 'Concluir checklist'}</Button>
    </div>
  );
}
