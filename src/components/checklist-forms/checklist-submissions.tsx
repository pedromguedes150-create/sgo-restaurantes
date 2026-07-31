'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';

interface Answer { itemId: string; label: string; kind: string; value: string | number | boolean | null }
interface SubmissionRow { id: string; templateId: string; formTitle: string; unitName: string; respondentName: string; createdAt: string; answers: Answer[] }
interface FormOpt { id: string; title: string }

const sel = 'h-9 rounded-lg border-2 border-input bg-background px-2 text-sm';
const dt = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

function showValue(a: Answer): string {
  if (a.kind === 'SECTION') return '';
  if (a.value === null || a.value === '') return '—';
  if (a.kind === 'BOOLEAN') return a.value ? 'Sim' : 'Não';
  if (a.kind === 'DATE' && typeof a.value === 'string') return a.value.split('-').reverse().join('/');
  return String(a.value);
}

export function ChecklistSubmissions({ forms, submissions, ficha, days }: { forms: FormOpt[]; submissions: SubmissionRow[]; ficha: string; days: number }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);

  function nav(patch: { ficha?: string; dias?: number }) {
    const f = patch.ficha !== undefined ? patch.ficha : ficha;
    const d = patch.dias !== undefined ? patch.dias : days;
    const sp = new URLSearchParams();
    if (f) sp.set('ficha', f);
    if (d) sp.set('dias', String(d));
    router.push(`/tarefas/fichas${sp.toString() ? `?${sp.toString()}` : ''}`);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-2">
        <select className={sel} value={ficha} onChange={(e) => nav({ ficha: e.target.value })}>
          <option value="">Todas as fichas</option>
          {forms.map((f) => <option key={f.id} value={f.id}>{f.title}</option>)}
        </select>
        <select className={sel} value={days} onChange={(e) => nav({ dias: Number(e.target.value) })}>
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
          <option value={365}>Último ano</option>
        </select>
        <span className="text-xs text-muted-foreground"><strong className="text-brand">{submissions.length}</strong> envio(s)</span>
      </div>

      {submissions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum envio no período.</p>
      ) : (
        <div className="space-y-1.5">
          {submissions.map((s) => (
            <div key={s.id} className="rounded-lg border bg-card">
              <button onClick={() => setOpenId((id) => (id === s.id ? null : s.id))} className="flex w-full items-center justify-between gap-2 p-3 text-left">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-brand"><FileText className="mr-1 inline h-4 w-4 text-accent" />{s.formTitle}</p>
                  <p className="text-xs text-muted-foreground">{s.respondentName} · {s.unitName} · {dt(s.createdAt)}</p>
                </div>
                {openId === s.id ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
              </button>
              {openId === s.id && (
                <div className="space-y-1 border-t px-3 py-2">
                  {s.answers.map((a, i) => a.kind === 'SECTION' ? (
                    <p key={i} className="pt-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{a.label}</p>
                  ) : (
                    <div key={i} className="flex justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">{a.label}</span>
                      <span className="font-medium text-brand">{showValue(a)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
