'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Square, CheckSquare, Clock, StickyNote, CalendarOff, ListTodo, Pencil, X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichText } from '@/components/ui/rich-text';

export interface MTask { id: string; title: string; notes: string | null; dueAt: string | null; done: boolean }
export interface MNote { id: string; title: string | null; content: string; createdAt: string }
export interface MLeave { id: string; kind: 'FOLGA' | 'FERIAS'; startDate: string; endDate: string; note: string | null }

function fmtDateTime(iso: string) { const d = new Date(iso); return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
function fmtBR(iso: string) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; }

// Opções de horário de 30 em 30 minutos.
const TIME_SLOTS: string[] = [];
for (let h = 0; h < 24; h++) for (const m of ['00', '30']) TIME_SLOTS.push(`${String(h).padStart(2, '0')}:${m}`);

/** Combina data (yyyy-mm-dd) + hora (HH:mm) num datetime-local. Vazio se sem data. */
function combine(date: string, time: string): string { return date ? `${date}T${time || '09:00'}` : ''; }
function splitDue(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${d.getMinutes() < 30 ? '00' : '30'}`;
  return { date, time };
}

function TimePicker({ date, time, onDate, onTime }: { date: string; time: string; onDate: (v: string) => void; onTime: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div><Label className="text-xs">Data</Label><Input type="date" value={date} onChange={(e) => onDate(e.target.value)} className="h-10 text-sm" /></div>
      <div><Label className="text-xs">Hora</Label>
        <select value={time || '09:00'} onChange={(e) => onTime(e.target.value)} disabled={!date} className="h-10 rounded-lg border-2 border-input bg-background px-2 text-sm disabled:opacity-50">
          {TIME_SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
    </div>
  );
}

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
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const pending = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-dashed p-3">
        <Label className="text-xs">Nova tarefa</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex: ligar para o fornecedor X" className="mt-1" />
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <TimePicker date={date} time={time} onDate={setDate} onTime={setTime} />
          <Button size="sm" disabled={busy || !title.trim()} onClick={async () => { if (await post({ entity: 'task', action: 'create', title, dueAt: combine(date, time) || undefined })) { setTitle(''); setDate(''); setTime('09:00'); } }}><Plus className="h-4 w-4" /> Adicionar</Button>
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
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(t.title);
  const init = splitDue(t.dueAt);
  const [date, setDate] = useState(init.date);
  const [time, setTime] = useState(init.time || '09:00');
  const overdue = !t.done && t.dueAt && new Date(t.dueAt) < new Date();

  if (editing) {
    return (
      <div className="rounded-lg border-2 border-accent/40 bg-card p-2.5">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mb-2 text-sm" />
        <TimePicker date={date} time={time} onDate={setDate} onTime={setTime} />
        <div className="mt-2 flex gap-1.5">
          <Button size="sm" disabled={busy || !title.trim()} onClick={async () => { if (await post({ entity: 'task', action: 'update', id: t.id, title, dueAt: date ? combine(date, time) : null })) setEditing(false); }}><Save className="h-4 w-4" /> Salvar</Button>
          <Button size="sm" variant="ghost" onClick={() => { setTitle(t.title); setDate(init.date); setTime(init.time || '09:00'); setEditing(false); }}><X className="h-4 w-4" /> Cancelar</Button>
        </div>
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-2 rounded-lg border bg-card p-2.5 ${t.done ? 'opacity-60' : ''}`}>
      <button onClick={() => post({ entity: 'task', action: 'toggle', id: t.id, done: !t.done })} disabled={busy} aria-label="Concluir">
        {t.done ? <CheckSquare className="h-5 w-5 text-success" /> : <Square className="h-5 w-5 text-muted-foreground" />}
      </button>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-medium ${t.done ? 'line-through' : 'text-brand'}`}>{t.title}</span>
        {t.dueAt && <span className={`block text-xs ${overdue ? 'font-semibold text-critical' : 'text-muted-foreground'}`}><Clock className="mr-0.5 inline h-3 w-3" />{fmtDateTime(t.dueAt)}</span>}
      </span>
      {!t.done && <button onClick={() => setEditing(true)} disabled={busy} className="text-muted-foreground hover:text-brand" aria-label="Editar"><Pencil className="h-4 w-4" /></button>}
      <button onClick={() => post({ entity: 'task', action: 'delete', id: t.id })} disabled={busy} className="text-critical" aria-label="Excluir"><Trash2 className="h-4 w-4" /></button>
    </div>
  );
}

function NotesTab({ notes, busy, post }: { notes: MNote[]; busy: boolean; post: Post }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const empty = !content.replace(/<[^>]*>/g, '').trim();
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-dashed p-3 space-y-2">
        <div><Label className="text-xs">Título (opcional)</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex: Ideias para a reunião" className="mt-1" /></div>
        <div><Label className="text-xs">Anotação</Label><div className="mt-1"><RichText value={content} onChange={setContent} placeholder="anote aqui… (use negrito, itálico, listas)" /></div></div>
        <Button size="sm" disabled={busy || empty} onClick={async () => { if (await post({ entity: 'note', action: 'add', title, content })) { setTitle(''); setContent(''); } }}><Plus className="h-4 w-4" /> Salvar nota</Button>
      </div>
      {notes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma anotação.</p>}
      <div className="space-y-2">
        {notes.map((n) => <NoteCard key={n.id} n={n} busy={busy} post={post} />)}
      </div>
    </div>
  );
}

function NoteCard({ n, busy, post }: { n: MNote; busy: boolean; post: Post }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(n.title ?? '');
  const [content, setContent] = useState(n.content);
  const empty = !content.replace(/<[^>]*>/g, '').trim();

  if (editing) {
    return (
      <div className="rounded-lg border-2 border-accent/40 bg-card p-2.5 space-y-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (opcional)" className="text-sm" />
        <RichText value={content} onChange={setContent} />
        <div className="flex gap-1.5">
          <Button size="sm" disabled={busy || empty} onClick={async () => { if (await post({ entity: 'note', action: 'update', id: n.id, title, content })) setEditing(false); }}><Save className="h-4 w-4" /> Salvar</Button>
          <Button size="sm" variant="ghost" onClick={() => { setTitle(n.title ?? ''); setContent(n.content); setEditing(false); }}><X className="h-4 w-4" /> Cancelar</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border bg-card p-2.5">
      {n.title && <p className="mb-1 font-semibold text-brand">{n.title}</p>}
      <div className="pop-rich text-sm" dangerouslySetInnerHTML={{ __html: n.content }} />
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{fmtDateTime(n.createdAt)}</span>
        <div className="flex gap-2">
          <button onClick={() => setEditing(true)} disabled={busy} className="text-muted-foreground hover:text-brand" aria-label="Editar"><Pencil className="h-4 w-4" /></button>
          <button onClick={() => post({ entity: 'note', action: 'delete', id: n.id })} disabled={busy} className="text-critical" aria-label="Excluir"><Trash2 className="h-4 w-4" /></button>
        </div>
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
