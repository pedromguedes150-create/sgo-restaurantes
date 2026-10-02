'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Pause, Play, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/ds/button';
import { Input } from '@/components/ui/ds/field';
import { Group } from '@/components/ui/ds/group';

export interface ReasonRow { id: string; name: string; active: boolean; usos?: number }

/**
 * Motivos de Hora Extra (v1.142.0) — o catálogo do "Comparativo por motivo".
 * Motivo em uso não se exclui (desativa); renomear vale para o histórico, que
 * aponta para o id e não para o texto.
 */
export function OvertimeReasonsConfig({ reasons }: { reasons: ReasonRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [novo, setNovo] = useState('');
  const [editando, setEditando] = useState<{ id: string; name: string } | null>(null);

  async function post(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity: 'overtimeReason', ...body }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Falha'); return false; }
      router.refresh(); return true;
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-3" id="motivos-hora-extra">
      <p className="text-xs text-ink-500">
        A lista que o gerente escolhe ao lançar Hora Extra — e pela qual o painel de Hora extra compara (&ldquo;Comparativo por motivo&rdquo;). Hora extra antiga, lançada com texto livre, aparece como <b>Outro</b>, com o texto preservado no detalhe.
      </p>
      <Group>
        {reasons.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 p-3">
            {editando?.id === r.id ? (
              <>
                <div className="w-64"><Input inputSize="sm" value={editando.name} onChange={(e) => setEditando({ id: r.id, name: e.target.value })} aria-label="Novo nome do motivo" /></div>
                <Button size="sm" disabled={busy} onClick={async () => { if (await post({ action: 'rename', id: r.id, name: editando.name })) setEditando(null); }}><Check className="h-4 w-4" /> Salvar</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditando(null)}><X className="h-4 w-4" /></Button>
              </>
            ) : (
              <>
                <span className={`inline-flex items-center rounded-pill border px-2 py-1 text-xs font-semibold ${r.active ? 'border-brand/40 bg-brand-tint text-brand' : 'border-line bg-canvas text-ink-400 line-through'}`}>{r.name}</span>
                <span className="text-xs text-ink-500">{r.usos ?? 0} uso(s)</span>
                <button type="button" disabled={busy} aria-label="Renomear" title="Renomear" onClick={() => setEditando({ id: r.id, name: r.name })} className="rounded p-1 hover:bg-surface"><Pencil className="h-3.5 w-3.5" /></button>
                <button type="button" disabled={busy} aria-label={r.active ? 'Desativar' : 'Ativar'} title={r.active ? 'Desativar' : 'Ativar'} onClick={() => post({ action: 'toggle', id: r.id, active: !r.active })} className="rounded p-1 hover:bg-surface">
                  {r.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </button>
                {(r.usos ?? 0) === 0 && (
                  <button type="button" disabled={busy} aria-label="Excluir" title="Excluir" onClick={() => { if (confirm(`Excluir o motivo "${r.name}"?`)) post({ action: 'delete', id: r.id }); }} className="rounded p-1 text-danger hover:bg-surface"><Trash2 className="h-3.5 w-3.5" /></button>
                )}
              </>
            )}
          </div>
        ))}
        <div className="flex items-end gap-1.5 p-3">
          <div className="w-64">
            <Input label="Novo motivo" inputSize="sm" placeholder="ex.: Escala incompleta" value={novo} onChange={(e) => setNovo(e.target.value)} />
          </div>
          <Button size="sm" variant="secondary" disabled={busy || !novo.trim()} onClick={async () => { if (await post({ action: 'add', name: novo })) setNovo(''); }}>
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </div>
      </Group>
    </div>
  );
}
