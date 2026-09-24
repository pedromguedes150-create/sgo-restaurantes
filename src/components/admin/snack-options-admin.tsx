'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';

/**
 * Catálogo das SOBRAS SALGADOS — tipos de salgado e motivos de descarte.
 * Duas listas, o mesmo gesto: adicionar, renomear, ativar/desativar. Não há
 * excluir: uma opção já usada num lançamento protege o histórico (FK), e
 * desativar já a tira da folha.
 */

export interface SnackOptionRow { id: string; name: string; active: boolean }

async function chamar(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/waste/salgados', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'opcao', ...body }) });
  const d = await res.json().catch(() => ({}));
  return res.ok ? { ok: true } : { ok: false, error: d.error ?? 'Falha' };
}

function Lista({ kind, titulo, itens }: { kind: 'TIPO' | 'MOTIVO'; titulo: string; itens: SnackOptionRow[] }) {
  const router = useRouter();
  const [novo, setNovo] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [nome, setNome] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(body: Record<string, unknown>, depois?: () => void) {
    setBusy(true); setMsg(null);
    const r = await chamar(body);
    setBusy(false);
    if (!r.ok) { setMsg(r.error ?? 'Falha'); return; }
    depois?.();
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <p className="sgo-type-13 font-semibold text-ink-900">{titulo}</p>
      <div className="flex gap-2">
        <Input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder={kind === 'TIPO' ? 'ex.: Coxinha' : 'ex.: Vencido'} className="h-9 flex-1 text-sm" />
        <Button size="sm" disabled={busy || !novo.trim()} onClick={() => void run({ op: 'create', kind, name: novo }, () => setNovo(''))}><Plus className="h-4 w-4" /> Adicionar</Button>
      </div>
      {msg && <p className="rounded-lg bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger">{msg}</p>}
      <ul className="divide-y divide-line rounded-lg border">
        {itens.length === 0 && <li className="px-3 py-2 text-xs text-ink-500">Nenhuma opção.</li>}
        {itens.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
            {editando === o.id ? (
              <Input value={nome} onChange={(e) => setNome(e.target.value)} className="h-8 flex-1 text-sm" aria-label={`Novo nome de ${o.name}`} />
            ) : (
              <span className={`text-sm ${o.active ? 'text-ink-900' : 'text-ink-500 line-through'}`}>{o.name}</span>
            )}
            <div className="flex shrink-0 items-center gap-1.5">
              <button type="button" disabled={busy} onClick={() => void run({ op: 'toggle', id: o.id, active: !o.active })}>
                <StatusBadge tone={o.active ? 'success' : 'critical'}>{o.active ? 'Ativa' : 'Inativa'}</StatusBadge>
              </button>
              {editando === o.id ? (
                <>
                  <Button size="sm" variant="ghost" disabled={busy} aria-label="Salvar" onClick={() => void run({ op: 'update', id: o.id, name: nome }, () => setEditando(null))}><Save className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" aria-label="Cancelar" onClick={() => setEditando(null)}><X className="h-4 w-4" /></Button>
                </>
              ) : (
                <Button size="sm" variant="ghost" aria-label={`Renomear ${o.name}`} onClick={() => { setEditando(o.id); setNome(o.name); }}><Pencil className="h-4 w-4" /></Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SnackOptionsAdmin({ tipos, motivos }: { tipos: SnackOptionRow[]; motivos: SnackOptionRow[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Lista kind="TIPO" titulo="Tipos de salgado" itens={tipos} />
      <Lista kind="MOTIVO" titulo="Motivos de descarte" itens={motivos} />
    </div>
  );
}
