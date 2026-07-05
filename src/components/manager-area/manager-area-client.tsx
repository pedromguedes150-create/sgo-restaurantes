'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Square, CheckSquare, Clock, StickyNote, CalendarOff, ListTodo } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface MTask { id: string; title: string; notes: string | null; dueAt: string | null; done: boolean }
export interface MNote { id: string; content: string; createdAt: string }
export interface MLeave { id: string; kind: 'FOLGA' | 'FERIAS'; startDate: string; endDate: string; note: string | null }

function fmtDateTime(iso: string) { const d = new Date(iso); return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
function fmtBR(iso: string) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }

export function ManagerAreaClient({ tasks, notes, leaves }: { tasks: MTask[]; notes: MNote[]; leaves: MLeave[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<'tarefas' | 'notas' | 'folgas'>('tarefas');
  const [busy, setBusy] = useState(false);

  async function post(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch('/api/manager-area', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Falha'); return false; }
      router.refresh(); return true;
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        <TabBtn active={tab === 'tarefas'} onClick={() => setTab('tarefas')} icon={<ListTodo className="h-4 w-4" />}>Minhas tarefas</TabBtn>
        <TabBtn active={tab === 'notas'} onClick={() => setTab('notas')} icon={<StickyNote className="h-4 w-4" />}>Bloco de notas</TabBtn>
        <TabBtn active={tab === 'folgas'} onClick={() => setTab('folgas')} icon={<CalendarOff className="h-4 w-4" />}>Folgas / férias</TabBtn>
      </div>
      {tab === 'tarefas' && <TasksTab tasks={tasks} busy={busy} post={post} />}
      {tab === 'notas' && <NotesTab notes={notes} busy={busy} post={post} />}
      {tab === 'folgas' && <LeavesTab leaves={leaves} busy={busy} post={post} />}
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${active ? 'bg-primary text-primary-foreground' : 'border'}`}>{icon}{children}</button>;
}

type Post = (b: Record<string, unknown>) => Promise<boolean>;

function TasksTab({ tasks, busy, post }: { tasks: MTask[]; busy: boolean; post: Post }) {
  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState('');
  const pending = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-dashed p-3">
        <Label className="text-xs">Nova tarefa</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex: ligar para o fornecedor X" className="mt-1" />
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div><Label className="text-xs">Lembrar em (opcional)</Label><Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="h-10 text-sm" /></div>
          <Button size="sm" disabled={busy || !title.trim()} onClick={async () => { if (await post({ entity: 'task', action: 'create', title, dueAt: dueAt || undefined })) { setTitle(''); setDueAt(''); } }}><Plus className="h-4 w-4" /> Adicionar</Button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Com data/hora, o sistema te lembra por notificação quando chegar.</p>
      </div>

      {pending.length === 0 && done.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma tarefa. Adicione acima.</p>}
      <div className="space-y-1.5">
        {pending.map((t) => <TaskRow key={t.id} t={t} busy={busy} post={post} />)}
      </div>
      {done.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Concluídas ({done.length})</summary>
          <div className="mt-1 space-y-1.5">{done.map((t) => <TaskRow key={t.id} t={t} busy={busy} post={post} />)}</div>
        </details>
      )}
    </div>
  );
}

function TaskRow({ t, busy, post }: { t: MTask; busy: boolean; post: Post }) {
  const overdue = !t.done && t.dueAt && new Date(t.dueAt) < new Date();
  return (
    <div className={`flex items-center gap-2 rounded-lg border bg-card p-2.5 ${t.done ? 'opacity-60' : ''}`}>
      <button onClick={() => post({ entity: 'task', action: 'toggle', id: t.id, done: !t.done })} disabled={busy} aria-label="Concluir">
        {t.done ? <CheckSquare className="h-5 w-5 text-success" /> : <Square className="h-5 w-5 text-muted-foreground" />}
      </button>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-medium ${t.done ? 'line-through' : 'text-brand'}`}>{t.title}</span>
        {t.dueAt && <span className={`block text-xs ${overdue ? 'font-semibold text-critical' : 'text-muted-foreground'}`}><Clock className="mr-0.5 inline h-3 w-3" />{fmtDateTime(t.dueAt)}</span>}
      </span>
      <button onClick={() => post({ entity: 'task', action: 'delete', id: t.id })} disabled={busy} className="text-critical" aria-label="Excluir"><Trash2 className="h-4 w-4" /></button>
    </div>
  );
}

function NotesTab({ notes, busy, post }: { notes: MNote[]; busy: boolean; post: Post }) {
  const [content, setContent] = useState('');
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-dashed p-3">
        <Label className="text-xs">Nova anotação</Label>
        <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} placeholder="anote aqui o que precisar lembrar…" className="mt-1 w-full rounded-lg border-2 border-input bg-background p-2 text-sm" />
        <Button size="sm" disabled={busy || !content.trim()} onClick={async () => { if (await post({ entity: 'note', action: 'add', content })) setContent(''); }}><Plus className="h-4 w-4" /> Salvar nota</Button>
      </div>
      {notes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma anotação.</p>}
      <div className="space-y-2">
        {notes.map((n) => (
          <div key={n.id} className="rounded-lg border bg-card p-2.5">
            <p className="whitespace-pre-wrap text-sm">{n.content}</p>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">{fmtDateTime(n.createdAt)}</span>
              <button onClick={() => post({ entity: 'note', action: 'delete', id: n.id })} disabled={busy} className="text-critical" aria-label="Excluir"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LeavesTab({ leaves, busy, post }: { leaves: MLeave[]; busy: boolean; post: Post }) {
  const [kind, setKind] = useState<'FOLGA' | 'FERIAS'>('FOLGA');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-dashed p-3">
        <p className="mb-2 text-xs text-muted-foreground">Nos dias de folga/férias, seus checklists e tarefas do dia não aparecem para você (você ainda pode entrar no sistema).</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Tipo</Label>
            <select value={kind} onChange={(e) => setKind(e.target.value as 'FOLGA' | 'FERIAS')} className="h-10 w-full rounded-lg border-2 border-input bg-background px-2 text-sm">
              <option value="FOLGA">Folga</option>
              <option value="FERIAS">Férias</option>
            </select>
          </div>
          <div><Label className="text-xs">Início</Label><Input type="date" value={start} onChange={(e) => { setStart(e.target.value); if (!end) setEnd(e.target.value); }} className="h-10 text-sm" /></div>
          <div><Label className="text-xs">Fim</Label><Input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className="h-10 text-sm" /></div>
        </div>
        <Button size="sm" className="mt-2" disabled={busy || !start || !end} onClick={async () => { if (await post({ entity: 'leave', action: 'add', kind, startDate: start, endDate: end })) { setStart(''); setEnd(''); } }}><Plus className="h-4 w-4" /> Agendar</Button>
      </div>
      {leaves.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma folga/férias agendada.</p>}
      <div className="space-y-1.5">
        {leaves.map((l) => (
          <div key={l.id} className="flex items-center justify-between rounded-lg border bg-card p-2.5 text-sm">
            <span><b className={l.kind === 'FERIAS' ? 'text-accent' : 'text-brand'}>{l.kind === 'FERIAS' ? 'Férias' : 'Folga'}</b> · {l.startDate === l.endDate ? fmtBR(l.startDate) : `${fmtBR(l.startDate)} a ${fmtBR(l.endDate)}`}</span>
            <button onClick={() => post({ entity: 'leave', action: 'delete', id: l.id })} disabled={busy} className="text-critical" aria-label="Excluir"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
