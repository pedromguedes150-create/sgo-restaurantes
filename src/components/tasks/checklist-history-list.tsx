'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, Trash2, CheckSquare, Square, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card, CardContent } from '@/components/ui/card';

type Tone = 'success' | 'medium' | 'critical' | 'neutral';
const ST: Record<string, { tone: Tone; label: string }> = {
  DONE: { tone: 'success', label: 'Concluída' },
  LATE: { tone: 'medium', label: 'Fora do prazo' },
  MISSED: { tone: 'critical', label: 'Não realizada' },
  PENDING: { tone: 'neutral', label: 'Pendente' },
};

export interface HistItem { id: string; name: string; unit: string; by: string | null; time: string | null; status: string }
export interface HistGroup { date: string; items: HistItem[] }

export function ChecklistHistoryList({ groups, isAdmin, groupByUnit = false }: { groups: HistGroup[]; isAdmin: boolean; groupByUnit?: boolean }) {
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const allIds = groups.flatMap((g) => g.items.map((i) => i.id));
  function toggle(id: string) { setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function clear() { setSel(new Set()); setSelecting(false); }

  async function removeSelected() {
    if (sel.size === 0) return;
    if (!confirm(`Excluir ${sel.size} registro(s) do histórico de checklists? Sai das métricas do mês e fica na Auditoria. Não pode ser desfeito.`)) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/ops', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity: 'taskInstance', action: 'deleteMany', ids: [...sel] }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(data.error ?? 'Falha'); return; }
      clear(); router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2">
          {!selecting ? (
            <Button size="sm" variant="outline" onClick={() => setSelecting(true)}><CheckSquare className="h-4 w-4" /> Selecionar para excluir</Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => setSel(new Set(allIds))}>Selecionar todos ({allIds.length})</Button>
              <Button size="sm" variant="ghost" onClick={clear}><X className="h-4 w-4" /> Cancelar</Button>
              <span className="text-sm text-ink-500">{sel.size} selecionado(s)</span>
            </>
          )}
        </div>
      )}

      {groups.length === 0 && <p className="text-sm text-ink-500">Nenhum registro no período.</p>}

      {groups.map((g, gi) => {
        const renderItem = (i: HistItem, showUnit: boolean) => {
          const checked = sel.has(i.id);
          const st = ST[i.status] ?? ST.PENDING;
          const sub = `${showUnit ? i.unit : ''}${showUnit && (i.by || i.time) ? ' · ' : ''}${i.by ?? ''}${i.by && i.time ? ' · ' : ''}${i.time ?? ''}`;
          if (selecting) {
            return (
              <button key={i.id} onClick={() => toggle(i.id)} className={`flex w-full items-center gap-2 rounded-lg border p-2.5 text-left transition-colors ${checked ? 'border-danger bg-danger/5' : 'bg-surface hover:border-brand'}`}>
                {checked ? <CheckSquare className="h-5 w-5 shrink-0 text-danger" /> : <Square className="h-5 w-5 shrink-0 text-ink-500" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-brand">{i.name}</span>
                  <span className="block text-xs text-ink-500">{sub || '—'}</span>
                </span>
                <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
              </button>
            );
          }
          return (
            <Link key={i.id} href={`/tarefas/${i.id}`} className="flex items-center gap-2 rounded-lg border bg-surface p-2.5 transition-colors hover:border-brand">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-brand">{i.name}</span>
                <span className="block text-xs text-ink-500">{sub || '—'}</span>
              </span>
              <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
              <Eye className="h-4 w-4 text-ink-500" />
            </Link>
          );
        };

        // Agrupa por unidade dentro do dia quando há mais de uma unidade
        const byUnit = new Map<string, HistItem[]>();
        for (const i of g.items) { const arr = byUnit.get(i.unit) ?? []; arr.push(i); byUnit.set(i.unit, arr); }
        const useUnitGroups = groupByUnit && byUnit.size > 1;

        return (
          <Card key={g.date}>
            <CardContent className="pt-4">
              {/* Dia recolhível — abre o mais recente por padrão; em modo seleção fica aberto (16/07) */}
              <details open={selecting || gi === 0} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-ink-500">{g.date} <span className="font-normal normal-case">· {g.items.length} checklist(s)</span></span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-ink-500 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-1.5 space-y-1.5">
                  {useUnitGroups
                    ? [...byUnit.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')).map(([unit, items]) => (
                        <div key={unit} className="space-y-1.5">
                          <p className="pt-1 text-xs font-semibold text-brand">{unit} <span className="font-normal text-ink-500">({items.length})</span></p>
                          {items.map((i) => renderItem(i, false))}
                        </div>
                      ))
                    : g.items.map((i) => renderItem(i, true))}
                </div>
              </details>
            </CardContent>
          </Card>
        );
      })}

      {/* Barra fixa de ação (seleção) */}
      {selecting && sel.size > 0 && (
        <div className="sticky bottom-20 z-30 flex items-center justify-between gap-2 rounded-xl border bg-surface/95 p-3 shadow-lg backdrop-blur md:bottom-4">
          <span className="text-sm font-semibold">{sel.size} selecionado(s)</span>
          <Button size="sm" variant="destructive" disabled={busy} onClick={removeSelected}><Trash2 className="h-4 w-4" /> Excluir selecionados</Button>
        </div>
      )}
    </div>
  );
}
