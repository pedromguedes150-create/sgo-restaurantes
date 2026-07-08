'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Check, RotateCcw, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { postAdmin } from '@/lib/admin-client';
import { cn } from '@/lib/utils';

type Status = 'PENDING' | 'DONE' | 'MISSED';
interface Item { recordId: string; popId: string; popTitle: string; status: Status; dueDate: string; periodKey: string }
interface Collab { collaboratorId: string; name: string; pending: number; done: number; missed: number; items: Item[] }
interface Group { sector: string; coverage: 'ok' | 'partial' | 'none'; collaborators: Collab[] }

const COV = { ok: { tone: 'success' as const, label: 'Em dia' }, partial: { tone: 'medium' as const, label: 'Pendências' }, none: { tone: 'critical' as const, label: 'Vencidos' } };
const ST: Record<Status, { tone: 'success' | 'medium' | 'critical'; label: string }> = {
  PENDING: { tone: 'medium', label: 'Pendente' }, DONE: { tone: 'success', label: 'Realizado' }, MISSED: { tone: 'critical', label: 'Não realizado' },
};

export function TrainingBoard({ board, isAdmin, weight }: { board: Group[]; isAdmin: boolean; weight: number }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [w, setW] = useState(String(weight));

  async function act(recordId: string, action: 'complete' | 'reopen') {
    setBusy(true);
    try {
      const res = await fetch('/api/training', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, recordId }) });
      if (res.ok) router.refresh(); else { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Falha'); }
    } finally { setBusy(false); }
  }
  async function saveWeight() {
    setBusy(true);
    const r = await postAdmin({ entity: 'training', action: 'setWeight', weight: Number(w) });
    setBusy(false);
    if (r.ok) router.refresh(); else alert(r.error ?? 'Falha');
  }

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex items-end gap-2 rounded-lg border border-dashed p-2">
          <div><label className="text-xs text-muted-foreground">Peso de Treinamentos na meta</label><Input inputMode="numeric" value={w} onChange={(e) => setW(e.target.value)} className="h-9 w-24 text-sm" /></div>
          <Button size="sm" variant="outline" disabled={busy} onClick={saveWeight}>Salvar peso</Button>
        </div>
      )}

      {board.length === 0 && <p className="text-sm text-muted-foreground">Nenhum treinamento configurado. Crie POPs marcados como Inicial ou de setor.</p>}

      {board.map((g) => (
        <div key={g.sector} className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{g.sector}</h2>
            <StatusBadge tone={COV[g.coverage].tone}>{COV[g.coverage].label}</StatusBadge>
          </div>
          {g.collaborators.map((c) => {
            const key = `${g.sector}:${c.collaboratorId}`;
            const expanded = open === key;
            return (
              <div key={key} className="rounded-lg border bg-card">
                <button onClick={() => setOpen(expanded ? null : key)} className="flex w-full items-center justify-between p-3 text-left">
                  <span className="flex items-center gap-2">
                    {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className="font-semibold text-brand">{c.name}</span>
                  </span>
                  <span className="flex items-center gap-1 text-xs">
                    {c.missed > 0 && <span className="rounded-full bg-critical/15 px-2 py-0.5 font-bold text-critical">{c.missed} vencido(s)</span>}
                    {c.pending > 0 && <span className="rounded-full bg-medium/20 px-2 py-0.5 font-bold text-[#92600A]">{c.pending} pendente(s)</span>}
                    {c.done > 0 && <span className="rounded-full bg-success/15 px-2 py-0.5 font-bold text-success">{c.done} ok</span>}
                  </span>
                </button>
                {expanded && (
                  <div className="space-y-2 border-t p-3">
                    {c.items.map((it) => (
                      <div key={it.recordId} className={cn('flex items-center justify-between gap-2 rounded-md p-2', it.status === 'MISSED' ? 'bg-critical/5' : 'bg-surface')}>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{it.popTitle}</p>
                          <p className="text-xs text-muted-foreground">prazo {it.dueDate} · <StatusBadge tone={ST[it.status].tone}>{ST[it.status].label}</StatusBadge></p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Link href={`/modulos/pops/${it.popId}?treino=${it.recordId}`}><Button size="sm" variant="outline"><BookOpen className="h-4 w-4" /> Abrir POP</Button></Link>
                          {it.status === 'DONE'
                            ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(it.recordId, 'reopen')} aria-label="Reabrir"><RotateCcw className="h-4 w-4" /></Button>
                            : <Button size="sm" disabled={busy} onClick={() => act(it.recordId, 'complete')}><Check className="h-4 w-4" /> Treinei</Button>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {g.collaborators.length === 0 && <p className="text-xs text-muted-foreground">Nenhum colaborador.</p>}
        </div>
      ))}
    </div>
  );
}
