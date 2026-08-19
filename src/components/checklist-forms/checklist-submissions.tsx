'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { Select } from '@/components/ui/ds/select';

interface Answer { itemId: string; label: string; kind: string; value: string | number | boolean | null }
interface SubmissionRow { id: string; templateId: string; formTitle: string; unitName: string; respondentName: string; createdAt: string; answers: Answer[] }
interface FormOpt { id: string; title: string }

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
        <div className="w-56">
          <Select
            aria-label="Ficha" size="sm" value={ficha} onValueChange={(v) => nav({ ficha: v })}
            options={[{ value: '', label: 'Todas as fichas' }, ...forms.map((f) => ({ value: f.id, label: f.title }))]}
          />
        </div>
        <div className="w-44">
          <Select
            aria-label="Período" size="sm" value={String(days)} onValueChange={(v) => nav({ dias: Number(v) })}
            options={[
              { value: '7', label: 'Últimos 7 dias' },
              { value: '30', label: 'Últimos 30 dias' },
              { value: '90', label: 'Últimos 90 dias' },
              { value: '365', label: 'Último ano' },
            ]}
          />
        </div>
        <span className="text-xs text-ink-500"><strong className="text-brand">{submissions.length}</strong> envio(s)</span>
      </div>

      {submissions.length === 0 ? (
        <p className="text-sm text-ink-500">Nenhum envio no período.</p>
      ) : (
        <div className="space-y-1.5">
          {submissions.map((s) => (
            <div key={s.id} className="rounded-lg border bg-surface">
              <button onClick={() => setOpenId((id) => (id === s.id ? null : s.id))} className="flex w-full items-center justify-between gap-2 p-3 text-left">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-900"><FileText className="mr-1 inline h-4 w-4 text-ink-900" />{s.formTitle}</p>
                  <p className="text-xs text-ink-500">{s.respondentName} · {s.unitName} · {dt(s.createdAt)}</p>
                </div>
                {openId === s.id ? <ChevronUp className="h-4 w-4 shrink-0 text-ink-500" /> : <ChevronDown className="h-4 w-4 shrink-0 text-ink-500" />}
              </button>
              {openId === s.id && (
                <div className="space-y-1 border-t px-3 py-2">
                  {s.answers.map((a, i) => a.kind === 'SECTION' ? (
                    <p key={i} className="pt-1 sgo-type-11 font-semibold text-ink-500">{a.label}</p>
                  ) : (
                    <div key={i} className="flex justify-between gap-3 text-sm">
                      <span className="text-ink-500">{a.label}</span>
                      <span className="font-medium text-ink-900">{showValue(a)}</span>
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
