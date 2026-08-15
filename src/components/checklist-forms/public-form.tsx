'use client';

import { useState } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import { Select } from '@/components/ui/ds/select';
import { DatePicker } from '@/components/ui/ds/date-picker';
import { TimePicker } from '@/components/ui/ds/time-picker';

interface Field { id: string; kind: string; label: string; section: string | null; required: boolean; options: string[]; order: number }
interface Data { title: string; description: string | null; unitName: string; fields: Field[]; collaborators: { id: string; name: string }[] }

const box = 'h-11 w-full rounded-lg border-2 border-input bg-background px-3 text-sm';

export function ChecklistPublicForm({ token, data }: { token: string; data: Data }) {
  const [collaboratorId, setCollaboratorId] = useState('');
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [honeypot, setHoneypot] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const set = (id: string, v: string | boolean) => setValues((s) => ({ ...s, [id]: v }));

  async function submit() {
    setErr(null);
    if (!collaboratorId) { setErr('Escolha o seu nome na lista.'); return; }
    for (const f of data.fields) {
      if (f.kind === 'SECTION' || !f.required) continue;
      const v = values[f.id];
      if (v === undefined || v === '' || v === false) { setErr(`Preencha: ${f.label}`); return; }
    }
    setBusy(true);
    try {
      const res = await fetch('/api/checklists/public', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, collaboratorId, answers: values, honeypot }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error ?? 'Não foi possível enviar.'); return; }
      setDone(true);
    } catch { setErr('Falha de conexão.'); } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="rounded-2xl border-2 border-success/40 bg-success/5 p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
        <p className="mt-2 text-lg font-bold text-brand">Enviado, obrigado!</p>
        <p className="text-sm text-muted-foreground">Seu preenchimento foi registrado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* honeypot anti-bot (escondido) */}
      <input type="text" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

      <div className="rounded-xl border bg-card p-3">
        <label className="mb-1 block text-sm font-semibold text-brand">Seu nome <span className="text-critical">*</span></label>
        <Select
          aria-label="Seu nome" placeholder="Selecione…" value={collaboratorId} onValueChange={setCollaboratorId}
          options={data.collaborators.map((c) => ({ value: c.id, label: c.name }))}
        />
        {data.collaborators.length === 0 && <p className="mt-1 text-xs text-critical">Nenhum funcionário cadastrado nesta unidade. Avise a gestão.</p>}
      </div>

      <div className="space-y-3">
        {data.fields.map((f) => {
          if (f.kind === 'SECTION') return <p key={f.id} className="pt-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">{f.label}</p>;
          const v = values[f.id];
          const lbl = <label className="mb-1 block text-sm font-semibold text-brand">{f.label} {f.required && <span className="text-critical">*</span>}</label>;
          if (f.kind === 'BOOLEAN') {
            return (
              <label key={f.id} className="flex items-center gap-2 rounded-xl border bg-card p-3 text-sm font-semibold text-brand">
                <input type="checkbox" className="h-5 w-5 accent-accent" checked={v === true} onChange={(e) => set(f.id, e.target.checked)} /> {f.label}{f.required && <span className="text-critical">*</span>}
              </label>
            );
          }
          return (
            <div key={f.id} className="rounded-xl border bg-card p-3">
              {lbl}
              {f.kind === 'TEXTAREA' ? (
                <textarea rows={3} className="w-full rounded-lg border-2 border-input bg-background px-3 py-2 text-sm" value={(v as string) ?? ''} onChange={(e) => set(f.id, e.target.value)} />
              ) : f.kind === 'SELECT' ? (
                <Select
                  aria-label={f.label} placeholder="Selecione…" value={(v as string) ?? ''} onValueChange={(nv) => set(f.id, nv)}
                  options={f.options.map((o) => ({ value: o, label: o }))}
                />
              ) : f.kind === 'DATE' ? (
                <DatePicker aria-label={f.label} value={(v as string) || null} onValueChange={(nv) => set(f.id, nv ?? '')} />
              ) : f.kind === 'TIME' ? (
                <TimePicker aria-label={f.label} value={(v as string) || null} onValueChange={(nv) => set(f.id, nv ?? '')} />
              ) : (
                <input
                  className={box}
                  type={f.kind === 'NUMBER' ? 'number' : 'text'}
                  inputMode={f.kind === 'NUMBER' ? 'decimal' : undefined}
                  value={(v as string) ?? ''}
                  onChange={(e) => set(f.id, e.target.value)}
                />
              )}
            </div>
          );
        })}
      </div>

      {err && <p className="rounded-lg bg-critical/10 px-3 py-2 text-sm font-medium text-critical">{err}</p>}
      <button onClick={submit} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-white disabled:opacity-60">
        <Send className="h-4 w-4" /> {busy ? 'Enviando…' : 'Enviar'}
      </button>
    </div>
  );
}
