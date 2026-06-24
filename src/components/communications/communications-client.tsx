'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Megaphone, Plus, X, Paperclip, LinkIcon, Pin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import { MultiSelect } from '@/components/ui/multi-select';
import { postAdmin } from '@/lib/admin-client';

type Priority = 'NORMAL' | 'IMPORTANT' | 'URGENT';
export interface InboxItem { recipientId: string; communicationId: string; status: 'PENDING' | 'CONFIRMED'; late: boolean; dueAt: string; title: string; priority: Priority; pinned: boolean; author: string; attachments: number }
export interface AuthoredItem { id: string; title: string; priority: Priority; pinned: boolean; dueAt: string; createdAt: string; total: number; confirmed: number; pending: number; units: string[] }
interface Unit { id: string; name: string }
interface Person { id: string; name: string; role: string }

const PRIO: Record<Priority, { label: string; tone: StatusTone } | null> = {
  NORMAL: null,
  IMPORTANT: { label: 'Importante', tone: 'medium' },
  URGENT: { label: 'Urgente', tone: 'critical' },
};

function fmt(d: string) { return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }

export function CommunicationsClient({ canAuthor, isAdmin, weight, units, people, inbox, authored }: {
  canAuthor: boolean; isAdmin: boolean; weight: number; units: Unit[]; people: Person[]; inbox: InboxItem[]; authored: AuthoredItem[];
}) {
  const pendingInbox = inbox.filter((i) => i.status === 'PENDING');
  const [tab, setTab] = useState<'recebidos' | 'novo' | 'painel'>(pendingInbox.length > 0 || !canAuthor ? 'recebidos' : 'painel');

  const tabs: { key: typeof tab; label: string; badge?: number; show: boolean }[] = [
    { key: 'recebidos', label: 'Recebidos', badge: pendingInbox.length, show: inbox.length > 0 || !canAuthor },
    { key: 'novo', label: 'Novo comunicado', show: canAuthor },
    { key: 'painel', label: 'Painel & Histórico', show: canAuthor },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.filter((t) => t.show).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={tab === t.key ? 'rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground' : 'rounded-full border px-3 py-1.5 text-sm font-medium'}>
            {t.label}{t.badge ? <span className="ml-1 rounded-full bg-critical px-1.5 text-xs text-white">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      {tab === 'recebidos' && <Inbox items={inbox} />}
      {tab === 'novo' && canAuthor && <Compose units={units} people={people} />}
      {tab === 'painel' && canAuthor && <Panel items={authored} isAdmin={isAdmin} weight={weight} />}
    </div>
  );
}

/* ───────── Caixa de entrada (gerente) ───────── */
function Inbox({ items }: { items: InboxItem[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">Nenhum comunicado para você.</p>;
  const pending = items.filter((i) => i.status === 'PENDING');
  const done = items.filter((i) => i.status === 'CONFIRMED');
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">A confirmar ({pending.length})</h2>
        {pending.length === 0 && <p className="text-sm text-success">Tudo confirmado. 🎉</p>}
        {pending.map((i) => <InboxCard key={i.recipientId} i={i} />)}
      </section>
      {done.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Confirmados ({done.length})</h2>
          {done.map((i) => <InboxCard key={i.recipientId} i={i} />)}
        </section>
      )}
    </div>
  );
}

function InboxCard({ i }: { i: InboxItem }) {
  const overdue = i.status === 'PENDING' && new Date(i.dueAt) < new Date();
  const st: { label: string; tone: StatusTone } = i.status === 'CONFIRMED'
    ? (i.late ? { label: 'Confirmado (atrasado)', tone: 'medium' } : { label: 'Confirmado', tone: 'success' })
    : (overdue ? { label: 'Não lido (vencido)', tone: 'critical' } : { label: 'A confirmar', tone: 'medium' });
  const prio = PRIO[i.priority];
  return (
    <Link href={`/modulos/comunicacao/${i.communicationId}`}>
      <div className="rounded-lg border bg-card p-3 transition-colors hover:border-accent">
        <div className="flex items-start justify-between gap-2">
          <p className="flex items-center gap-1.5 font-semibold text-brand">
            {i.pinned && <Pin className="h-4 w-4 text-gold" />}{i.title}
          </p>
          <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {prio && <span className="font-semibold text-medium">{prio.label} · </span>}por {i.author} · prazo {fmt(i.dueAt)}{i.attachments > 0 ? ` · ${i.attachments} anexo(s)` : ''}
        </p>
      </div>
    </Link>
  );
}

/* ───────── Painel & histórico (autor) ───────── */
function Panel({ items, isAdmin, weight }: { items: AuthoredItem[]; isAdmin: boolean; weight: number }) {
  const router = useRouter();
  const [w, setW] = useState(String(weight));
  const [busy, setBusy] = useState(false);
  async function saveWeight() {
    setBusy(true);
    const r = await postAdmin({ entity: 'communication', action: 'setWeight', weight: Number(w) });
    setBusy(false);
    if (r.ok) router.refresh(); else alert(r.error ?? 'Falha');
  }
  return (
    <div className="space-y-3">
      {isAdmin && (
        <div className="flex items-end gap-2 rounded-lg border border-dashed p-2">
          <div><label className="text-xs text-muted-foreground">Peso de Comunicados na meta</label><Input inputMode="numeric" value={w} onChange={(e) => setW(e.target.value)} className="h-9 w-24 text-sm" /></div>
          <Button size="sm" variant="outline" disabled={busy} onClick={saveWeight}>Salvar peso</Button>
        </div>
      )}
      {items.length === 0 && <p className="text-sm text-muted-foreground">Nenhum comunicado publicado ainda.</p>}
      {items.map((c) => {
        const pct = c.total === 0 ? 0 : Math.round((c.confirmed / c.total) * 100);
        const prio = PRIO[c.priority];
        return (
          <Link key={c.id} href={`/modulos/comunicacao/${c.id}`}>
            <div className="rounded-lg border bg-card p-3 transition-colors hover:border-accent">
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-1.5 font-semibold text-brand">{c.pinned && <Pin className="h-4 w-4 text-gold" />}{c.title}</p>
                <span className="text-sm font-bold text-brand">{c.confirmed}/{c.total}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{prio && <span className="font-semibold text-medium">{prio.label} · </span>}prazo {fmt(c.dueAt)} · {c.units.length ? c.units.join(', ') : 'destinatários avulsos'}</p>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} /></div>
              {c.pending > 0 && <p className="mt-1 text-xs text-medium">{c.pending} pendente(s)</p>}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/* ───────── Compor comunicado (autor) ───────── */
function Compose({ units, people }: { units: Unit[]; people: Person[] }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<Priority>('NORMAL');
  const [pinned, setPinned] = useState(false);
  const [requiresResponse, setRequiresResponse] = useState(false);
  const [dueAt, setDueAt] = useState('');
  const [unitIds, setUnitIds] = useState<string[]>([]);
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [links, setLinks] = useState<{ label: string; url: string }[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const sel = 'h-11 w-full rounded-lg border-2 border-input bg-background px-3 text-sm';

  async function submit() {
    setErr(null); setOkMsg(null);
    if (!title.trim() || !body.trim() || !dueAt) { setErr('Preencha título, mensagem e prazo.'); return; }
    if (unitIds.length === 0 && extraIds.length === 0) { setErr('Escolha ao menos uma unidade ou pessoa.'); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('title', title); fd.set('body', body); fd.set('priority', priority);
      fd.set('pinned', String(pinned)); fd.set('requiresResponse', String(requiresResponse));
      fd.set('dueAt', new Date(dueAt).toISOString());
      fd.set('unitIds', JSON.stringify(unitIds));
      fd.set('extraUserIds', JSON.stringify(extraIds));
      fd.set('links', JSON.stringify(links.filter((l) => l.url.trim())));
      for (const f of files) fd.append('attachments', f);
      const res = await fetch('/api/communications', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error ?? 'Falha'); return; }
      setOkMsg(`Comunicado publicado para ${data.recipients} destinatário(s).`);
      setTitle(''); setBody(''); setPriority('NORMAL'); setPinned(false); setRequiresResponse(false); setDueAt(''); setUnitIds([]); setExtraIds([]); setLinks([]); setFiles([]);
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <div><Label>Título</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex: Padrão da vitrine para o fim de semana" /></div>
      <div><Label>Mensagem</Label><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="w-full rounded-lg border-2 border-input bg-background px-3 py-2 text-sm" placeholder="Escreva o comunicado…" /></div>

      <div className="grid grid-cols-2 gap-2">
        <div><Label>Prioridade</Label>
          <select className={sel} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            <option value="NORMAL">Normal</option><option value="IMPORTANT">Importante</option><option value="URGENT">Urgente</option>
          </select>
        </div>
        <div><Label>Prazo de confirmação</Label><Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> <Pin className="h-4 w-4" /> Fixar no topo</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={requiresResponse} onChange={(e) => setRequiresResponse(e.target.checked)} /> Exigir resposta (foto/comentário)</label>
      </div>

      <div>
        <Label>Unidades (todos os gerentes confirmam)</Label>
        <MultiSelect options={units.map((u) => ({ value: u.id, label: u.name }))} selected={unitIds} onChange={setUnitIds} placeholder="Escolha as unidades…" searchable={units.length > 6} />
      </div>

      <div>
        <Label>Destinatários avulsos (opcional)</Label>
        <MultiSelect options={people.map((p) => ({ value: p.id, label: p.name }))} selected={extraIds} onChange={setExtraIds} placeholder="Pessoas específicas…" searchable emptyLabel="Sem pessoas no seu escopo" allLabel="todos" />
      </div>

      {/* Links */}
      <div>
        <Label className="flex items-center gap-1"><LinkIcon className="h-4 w-4" /> Links</Label>
        {links.map((l, idx) => (
          <div key={idx} className="mt-1 grid grid-cols-12 gap-1">
            <Input value={l.label} onChange={(e) => setLinks(links.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))} placeholder="Rótulo" className="col-span-4 h-9 text-sm" />
            <Input value={l.url} onChange={(e) => setLinks(links.map((x, i) => i === idx ? { ...x, url: e.target.value } : x))} placeholder="https://…" className="col-span-7 h-9 text-sm" />
            <Button size="sm" variant="ghost" className="col-span-1 text-critical" onClick={() => setLinks(links.filter((_, i) => i !== idx))} aria-label="Remover link"><X className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button size="sm" variant="outline" className="mt-1" onClick={() => setLinks([...links, { label: '', url: '' }])}><Plus className="h-4 w-4" /> Adicionar link</Button>
      </div>

      {/* Anexos */}
      <div>
        <Label className="flex items-center gap-1"><Paperclip className="h-4 w-4" /> Anexos (fotos/PDF)</Label>
        <input type="file" multiple accept="image/*,application/pdf" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className="block w-full text-sm" />
        {files.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{files.length} arquivo(s) selecionado(s)</p>}
      </div>

      {err && <p className="rounded-lg bg-critical/10 px-3 py-2 text-sm font-medium text-critical">{err}</p>}
      {okMsg && <p className="rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success">{okMsg}</p>}
      <Button onClick={submit} disabled={busy} size="lg" className="w-full"><Megaphone className="h-5 w-5" /> Publicar comunicado</Button>
    </div>
  );
}
