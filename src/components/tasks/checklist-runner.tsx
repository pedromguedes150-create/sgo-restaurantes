'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Check, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { compressImage } from '@/lib/image-compress';

type ItemStatus = 'OK' | 'EM_CORRECAO' | 'A_CORRIGIR';
interface Item { id: string; section: string | null; text: string; requiresPhoto: boolean; aiCheck?: boolean }
interface AiState { loading?: boolean; configured?: boolean; verdict?: 'COMPATIVEL' | 'DIVERGENTE' | 'INCERTO'; observations?: string; error?: string }
interface Answer { status: ItemStatus; note?: string }

const ST: Record<ItemStatus, { label: string; short: string; cls: string }> = {
  OK:          { label: 'De acordo',  short: '🟢', cls: 'bg-success text-white border-success' },
  EM_CORRECAO: { label: 'Em correção', short: '🟡', cls: 'bg-medium text-[#3b2a00] border-medium' },
  A_CORRIGIR:  { label: 'A corrigir',  short: '🔴', cls: 'bg-critical text-white border-critical' },
};
const STATUSES: ItemStatus[] = ['OK', 'EM_CORRECAO', 'A_CORRIGIR'];

export function ChecklistRunner({ instanceId, requiresEvidence, done, lateStatus, items, initialAnswers, photos }: {
  instanceId: string; requiresEvidence: boolean; done: boolean; lateStatus: boolean;
  items: Item[]; initialAnswers: Record<string, { status: string; note?: string }>; photos: string[];
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => {
    const out: Record<string, Answer> = {};
    for (const [k, v] of Object.entries(initialAnswers)) out[k] = { status: v.status as ItemStatus, note: v.note };
    return out;
  });
  const [files, setFiles] = useState<File[]>([]);
  const [ai, setAi] = useState<Record<string, AiState>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function analyzeAi(itemId: string, rawFile: File) {
    const file = await compressImage(rawFile);
    setFiles((f) => [...f, file].slice(0, 5)); // a foto também é salva no checklist
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
  async function addFiles(list: FileList | null) {
    if (!list) return;
    setProcessing(true);
    try {
      const compressed = await Promise.all(Array.from(list).map((f) => compressImage(f)));
      setFiles((f) => [...f, ...compressed].slice(0, 5));
    } finally { setProcessing(false); }
  }

  async function submit() {
    if (requiresEvidence && files.length === 0) { setMsg('Este checklist exige ao menos uma foto.'); return; }
    const unanswered = items.filter((i) => !answers[i.id]);
    if (unanswered.length > 0) { setMsg(`Responda todos os itens (${unanswered.length} pendente(s)).`); return; }
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.set('items', JSON.stringify(items.map((i) => ({ itemId: i.id, itemText: i.text, status: answers[i.id]?.status ?? 'OK', note: answers[i.id]?.note ?? '' }))));
      files.forEach((f) => fd.append('photos', f));
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
        <p className={cn('rounded-lg px-3 py-2 text-sm font-semibold', lateStatus ? 'bg-medium/15 text-[#92600A]' : 'bg-success/10 text-success')}>
          {lateStatus ? 'Concluído fora do prazo (não conta na meta).' : 'Concluído no prazo.'}
        </p>
        {groups.map((g) => (
          <div key={g.section ?? '_'}>
            {g.section && <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{g.section}</p>}
            <div className="space-y-1">
              {g.items.map((it) => {
                const a = answers[it.id];
                return (
                  <div key={it.id} className="flex items-start justify-between gap-2 rounded-md border p-2 text-sm">
                    <span>{it.text}{a?.note ? <span className="block text-xs text-muted-foreground">{a.note}</span> : null}</span>
                    {a && <span className={cn('shrink-0 rounded px-2 py-0.5 text-xs font-bold', ST[a.status].cls)}>{ST[a.status].label}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {photos.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Fotos</p>
            <div className="flex flex-wrap gap-2">
              {photos.map((p, i) => <a key={i} href={p} target="_blank" rel="noreferrer"><img src={p} alt="" className="h-24 w-24 rounded-lg border object-cover" /></a>)}
            </div>
          </div>
        )}
        {items.length === 0 && photos.length === 0 && <p className="text-sm text-muted-foreground">Tarefa concluída.</p>}
      </div>
    );
  }

  /* ───── Execução ───── */
  return (
    <div className="space-y-4">
      {items.length === 0 && <p className="text-sm text-muted-foreground">Este checklist não tem itens — basta anexar foto (se exigida) e concluir.</p>}
      {groups.map((g) => (
        <div key={g.section ?? '_'}>
          {g.section && <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{g.section}</p>}
          <div className="space-y-2">
            {g.items.map((it) => {
              const a = answers[it.id];
              return (
                <div key={it.id} className="rounded-lg border bg-card p-2.5">
                  <p className="text-sm font-medium">{it.text}{it.requiresPhoto && <span className="ml-1 text-xs text-gold-dark">(foto)</span>}</p>
                  <div className="mt-2 grid grid-cols-3 gap-1">
                    {STATUSES.map((s) => (
                      <button key={s} onClick={() => setItem(it.id, { status: s })} className={cn('rounded-md border px-2 py-1.5 text-xs font-semibold', a?.status === s ? ST[s].cls : 'border-input text-muted-foreground')}>
                        {ST[s].short} {ST[s].label}
                      </button>
                    ))}
                  </div>
                  {a && a.status !== 'OK' && (
                    <input value={a.note ?? ''} onChange={(e) => setItem(it.id, { note: e.target.value })} placeholder="Observação (o que corrigir)" className="mt-2 h-9 w-full rounded-md border-2 border-input bg-background px-2 text-sm" />
                  )}
                  {it.aiCheck && (
                    <div className="mt-2 rounded-md border border-dashed bg-background/60 p-2">
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-accent">
                        <Sparkles className="h-4 w-4" /> {ai[it.id]?.loading ? 'Analisando com IA…' : 'Conferir a foto com IA'}
                        <input type="file" accept="image/*" capture="environment" hidden disabled={ai[it.id]?.loading} onChange={(e) => { const f = e.target.files?.[0]; if (f) analyzeAi(it.id, f); e.target.value = ''; }} />
                      </label>
                      {ai[it.id] && !ai[it.id].loading && (
                        ai[it.id].configured === false ? <p className="mt-1 text-xs text-muted-foreground">IA não configurada no servidor.</p>
                        : ai[it.id].error ? <p className="mt-1 text-xs text-critical">{ai[it.id].error}</p>
                        : ai[it.id].verdict ? (
                          <p className={cn('mt-1 text-xs font-medium', ai[it.id].verdict === 'COMPATIVEL' ? 'text-success' : ai[it.id].verdict === 'DIVERGENTE' ? 'text-critical' : 'text-[#92600A]')}>
                            {ai[it.id].verdict === 'COMPATIVEL' ? '🟢 Compatível' : ai[it.id].verdict === 'DIVERGENTE' ? '🔴 Divergente' : '🟡 Incerto'}{ai[it.id].observations ? ` — ${ai[it.id].observations}` : ''}
                          </p>
                        ) : null
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Fotos (até 5) */}
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Fotos {requiresEvidence && <span className="text-gold-dark">(obrigatória)</span>} — até 5</p>
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={i} className="relative">
              <img src={URL.createObjectURL(f)} alt="" className="h-20 w-20 rounded-lg border object-cover" />
              <button onClick={() => setFiles((arr) => arr.filter((_, idx) => idx !== i))} className="absolute -right-1 -top-1 rounded-full bg-critical p-0.5 text-white"><X className="h-3 w-3" /></button>
            </div>
          ))}
          {files.length < 5 && (
            <button onClick={() => fileRef.current?.click()} disabled={processing} className="flex h-20 w-20 flex-col items-center justify-center rounded-lg border-2 border-dashed text-xs text-muted-foreground disabled:opacity-60">
              <Camera className="h-5 w-5" /> {processing ? 'aguarde…' : 'foto'}
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden multiple onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      </div>

      {msg && <p className="text-sm font-medium text-critical">{msg}</p>}
      <p className="text-[11px] text-muted-foreground">Seu preenchimento é salvo automaticamente — se for interrompido, retoma de onde parou.</p>
      <Button onClick={submit} disabled={busy} size="lg" className="w-full"><Check className="h-5 w-5" /> {busy ? 'Concluindo…' : 'Concluir checklist'}</Button>
    </div>
  );
}
